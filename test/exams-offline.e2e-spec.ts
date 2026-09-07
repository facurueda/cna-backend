import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Language, Role } from '@prisma/client';
import type { Server } from 'http';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * End-to-end HTTP test for the offline-resilient exam flow.
 *
 * Exercises the exact contract the quiz page uses:
 *   POST /exams                     create a practice exam
 *   POST /exams/:id/answer          per-click save (the ones that "got through")
 *   PUT  /exams/:id/answers         bulk reconcile (retry worker / pre-finish)
 *   POST /exams/:id/finish {reason} close — TIMEOUT must always succeed
 *
 * Requires a Postgres reachable via DATABASE_URL (a throwaway DB).
 */
type ExamQuestionView = { id: string; selectedKeys: string[] };
type ExamView = { id: string; status: string; questions: ExamQuestionView[] };
type FinishView = {
  status: string;
  correctCount: number;
  wrongCount: number;
};
type BulkView = { ok: boolean; saved: number };

const body = <T>(res: request.Response): T => res.body as T;

describe('Exam offline sync (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let token: string;
  let userId: string;
  let categoryId: string;

  const authedGet = (url: string) =>
    request(server).get(url).set('Authorization', `Bearer ${token}`);
  const authedPost = (url: string) =>
    request(server).post(url).set('Authorization', `Bearer ${token}`);
  const authedPut = (url: string) =>
    request(server).put(url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);

    // seed: user + category + 5 questions (ES translation, answers a/b, correct = a)
    const user = await prisma.user.create({
      data: {
        firstName: 'E2E',
        lastName: 'Tester',
        email: `e2e-${Date.now()}@test.local`,
        password: 'x',
        role: Role.GENERAL,
      },
    });
    userId = user.id;
    token = jwt.sign(
      { sub: user.id, role: Role.GENERAL },
      process.env.JWT_SECRET as string,
    );

    const category = await prisma.category.create({
      data: { name: 'E2E Rule' },
    });
    categoryId = category.id;

    for (let i = 0; i < 5; i += 1) {
      await prisma.question.create({
        data: {
          code: `E2E-Q${i}-${Date.now()}`,
          order: i + 1,
          categoryId: category.id,
          correctAnswerKeys: { create: [{ key: 'a' }] },
          translations: {
            create: [
              {
                language: Language.ES,
                text: `Pregunta E2E ${i}`,
                answers: {
                  create: [
                    { key: 'a', text: 'Correcta' },
                    { key: 'b', text: 'Incorrecta' },
                  ],
                },
              },
            ],
          },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.exam.deleteMany({ where: { userId } });
    await prisma.question.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  async function createExam() {
    const res = await authedPost('/exams').send({
      questionCount: 5,
      categoryIds: [categoryId],
      isTimed: false,
      examType: 'PRACTICE',
      language: 'ES',
    });
    expect(res.status).toBe(201);
    const exam = body<ExamView>(res);
    expect(exam.status).toBe('PENDING');
    const ids = exam.questions.map((q) => q.id);
    expect(ids).toHaveLength(5);
    return { examId: exam.id, questionIds: ids };
  }

  it('reconciles offline answers via bulk PUT and finishes on TIMEOUT with a blank question', async () => {
    const { examId, questionIds } = await createExam();
    const [q0, q1, q2, q3, q4] = questionIds;

    // answers that "got through" while online
    for (const id of [q0, q1]) {
      const r = await authedPost(`/exams/${examId}/answer`).send({
        examQuestionId: id,
        selectedKeys: ['a'],
      });
      expect(r.status).toBe(201);
    }

    // connection dropped: q2 & q3 only exist locally, now reconciled in one PUT
    const bulk = await authedPut(`/exams/${examId}/answers`).send({
      answers: [
        { examQuestionId: q2, selectedKeys: ['a'] },
        { examQuestionId: q3, selectedKeys: ['a'] },
      ],
    });
    expect(bulk.status).toBe(200);
    expect(body<BulkView>(bulk)).toEqual({ ok: true, saved: 2 });

    // retry worker re-sends everything it still has: must be idempotent
    const resend = await authedPut(`/exams/${examId}/answers`).send({
      answers: [q0, q1, q2, q3].map((id) => ({
        examQuestionId: id,
        selectedKeys: ['a'],
      })),
    });
    expect(resend.status).toBe(200);
    expect(body<BulkView>(resend)).toEqual({ ok: true, saved: 4 });

    // an invalid option key is rejected and writes nothing
    const bad = await authedPut(`/exams/${examId}/answers`).send({
      answers: [{ examQuestionId: q4, selectedKeys: ['zzz'] }],
    });
    expect(bad.status).toBe(400);

    // state check: 4 answered, q4 still blank
    const detail = await authedGet(`/exams/${examId}`);
    const answeredKeysById = new Map(
      body<ExamView>(detail).questions.map((q) => [q.id, q.selectedKeys]),
    );
    expect(answeredKeysById.get(q0)).toEqual(['a']);
    expect(answeredKeysById.get(q3)).toEqual(['a']);
    expect(answeredKeysById.get(q4)).toEqual([]);

    // TIMEOUT finish: must close even with q4 unanswered (graded wrong)
    const finished = await authedPost(`/exams/${examId}/finish`).send({
      reason: 'TIMEOUT',
    });
    expect(finished.status).toBe(201);
    const result = body<FinishView>(finished);
    expect(result.status).toBe('FINISHED');
    expect(result.correctCount).toBe(4);
    expect(result.wrongCount).toBe(1);

    // finishing again is rejected
    const again = await authedPost(`/exams/${examId}/finish`).send({
      reason: 'TIMEOUT',
    });
    expect(again.status).toBe(400);

    // answering a closed exam is rejected
    const late = await authedPut(`/exams/${examId}/answers`).send({
      answers: [{ examQuestionId: q4, selectedKeys: ['a'] }],
    });
    expect(late.status).toBe(400);
  });

  it('backend never blocks finish for being incomplete (UI is the gate)', async () => {
    const { examId, questionIds } = await createExam();

    await authedPost(`/exams/${examId}/answer`).send({
      examQuestionId: questionIds[0],
      selectedKeys: ['a'],
    });

    const finished = await authedPost(`/exams/${examId}/finish`).send({
      reason: 'MANUAL',
    });
    expect(finished.status).toBe(201);
    const result = body<FinishView>(finished);
    expect(result.status).toBe('FINISHED');
    expect(result.correctCount).toBe(1);
    expect(result.wrongCount).toBe(4);
  });
});
