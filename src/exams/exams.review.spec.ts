import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExamStatus, ExamType, Role } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { UserStatsService } from '../users/user-stats.service';

type PrismaMock = {
  exam: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

const mockAuthGuard: CanActivate = {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-user-id'];
    if (!userId || Array.isArray(userId)) {
      throw new UnauthorizedException('Missing auth header');
    }

    const roleHeader = req.headers['x-user-role'];
    req.user = {
      id: userId,
      role:
        !Array.isArray(roleHeader) && roleHeader === Role.ADMIN
          ? Role.ADMIN
          : Role.GENERAL,
    };

    return true;
  },
};

describe('ExamsController review endpoint', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = {
      exam: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ExamsController],
      providers: [
        ExamsService,
        {
          provide: UserStatsService,
          useValue: {
            registerFinishedExam: jest.fn(),
            incrementClips: jest.fn(),
            incrementComments: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when request is not authenticated', async () => {
    await request(app.getHttpServer()).get('/exams/exam-123/review').expect(401);
    expect(prisma.exam.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when exam does not exist', async () => {
    prisma.exam.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/exams/missing/review')
      .set('x-user-id', 'user-1')
      .expect(404);
  });

  it('returns 403 when user has no permissions over the exam', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-123',
      userId: 'owner-user',
      status: ExamStatus.FINISHED,
      questionCount: 1,
      passThresholdPercent: 70,
      correctCount: 1,
      wrongCount: 0,
      scorePercent: 100,
      isPassed: true,
      questions: [],
    });

    await request(app.getHttpServer())
      .get('/exams/exam-123/review')
      .set('x-user-id', 'another-user')
      .expect(403);
  });

  it('returns 409 when exam is not finished yet', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-123',
      userId: 'user-1',
      status: ExamStatus.PENDING,
      questionCount: 1,
      passThresholdPercent: 70,
      correctCount: null,
      wrongCount: null,
      scorePercent: null,
      isPassed: null,
      questions: [],
    });

    await request(app.getHttpServer())
      .get('/exams/exam-123/review')
      .set('x-user-id', 'user-1')
      .expect(409);
  });

  it('returns review payload for a failed exam', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-123',
      userId: 'user-1',
      status: ExamStatus.FINISHED,
      questionCount: 2,
      passThresholdPercent: 70,
      correctCount: 1,
      wrongCount: 1,
      scorePercent: 50,
      isPassed: false,
      questions: [
        {
          id: 'eq-1',
          position: 1,
          questionText: 'Texto de la pregunta 1',
          options: [
            { key: 'a', text: 'Opcion A' },
            { key: 'b', text: 'Opcion B' },
          ],
          correctKeys: [{ key: 'b' }],
          responses: [{ key: 'a' }],
        },
        {
          id: 'eq-2',
          position: 2,
          questionText: 'Texto de la pregunta 2',
          options: [
            { key: 'a', text: 'Opcion A' },
            { key: 'b', text: 'Opcion B' },
          ],
          correctKeys: [{ key: 'a' }],
          responses: [{ key: 'a' }],
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/exams/exam-123/review')
      .set('x-user-id', 'user-1')
      .expect(200);

    expect(response.body).toEqual({
      id: 'exam-123',
      status: 'FINISHED',
      questionCount: 2,
      correctCount: 1,
      wrongCount: 1,
      scorePercent: 50,
      isPassed: false,
      examQuestions: [
        {
          id: 'eq-1',
          order: 1,
          prompt: 'Texto de la pregunta 1',
          options: [
            { key: 'a', text: 'Opcion A', isCorrect: false },
            { key: 'b', text: 'Opcion B', isCorrect: true },
          ],
        },
        {
          id: 'eq-2',
          order: 2,
          prompt: 'Texto de la pregunta 2',
          options: [
            { key: 'a', text: 'Opcion A', isCorrect: true },
            { key: 'b', text: 'Opcion B', isCorrect: false },
          ],
        },
      ],
      answers: [
        { examQuestionId: 'eq-1', selectedKeys: ['a'] },
        { examQuestionId: 'eq-2', selectedKeys: ['a'] },
      ],
    });
  });

  it('returns review payload for a passed exam', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-999',
      userId: 'user-1',
      status: ExamStatus.FINISHED,
      questionCount: 2,
      passThresholdPercent: 70,
      correctCount: 2,
      wrongCount: 0,
      scorePercent: 100,
      isPassed: true,
      questions: [
        {
          id: 'eq-10',
          position: 1,
          questionText: 'Pregunta 10',
          options: [
            { key: 'a', text: 'Opcion A' },
            { key: 'b', text: 'Opcion B' },
          ],
          correctKeys: [{ key: 'a' }],
          responses: [{ key: 'a' }],
        },
        {
          id: 'eq-20',
          position: 2,
          questionText: 'Pregunta 20',
          options: [
            { key: 'a', text: 'Opcion A' },
            { key: 'b', text: 'Opcion B' },
          ],
          correctKeys: [{ key: 'b' }],
          responses: [{ key: 'b' }],
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/exams/exam-999/review')
      .set('x-user-id', 'user-1')
      .expect(200);

    expect(response.body.correctCount).toBe(2);
    expect(response.body.wrongCount).toBe(0);
    expect(response.body.scorePercent).toBe(100);
    expect(response.body.isPassed).toBe(true);
  });

  it('does not expose correct answers in GET /exams/:id quiz endpoint', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-quiz',
      userId: 'user-1',
      questionCount: 1,
      isTimed: false,
      totalTimeSeconds: null,
      status: ExamStatus.PENDING,
      examType: ExamType.PRACTICE,
      passThresholdPercent: 70,
      correctCount: null,
      wrongCount: null,
      scorePercent: null,
      isPassed: null,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
      finishedAt: null,
      questions: [
        {
          id: 'eq-quiz-1',
          position: 1,
          questionCode: 'Q-1',
          questionText: 'Pregunta de quiz',
          categoryName: 'Regla 1',
          options: [
            { id: 'opt-1', key: 'a', text: 'Opcion A' },
            { id: 'opt-2', key: 'b', text: 'Opcion B' },
          ],
          responses: [{ key: 'a' }],
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/exams/exam-quiz')
      .set('x-user-id', 'user-1')
      .expect(200);

    expect(response.body.questions[0].options[0]).not.toHaveProperty('isCorrect');
    expect(response.body.questions[0].options[1]).not.toHaveProperty('isCorrect');
  });
});
