import { ConflictException } from '@nestjs/common';
import {
  ExamStatus,
  ExamType,
  FinalExamCatalogKind,
  Language,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExamActivityBus } from './exam-activity.bus';
import { UserStatsService } from '../users/user-stats.service';
import { ExamsService } from './exams.service';

describe('ExamsService', () => {
  const tx = {
    exam: {
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    examQuestion: {
      create: jest.fn(),
    },
    examQuestionResponse: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    finalExamCatalogPair: {
      findFirst: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(),
    category: {
      findMany: jest.fn(),
    },
    question: {
      findMany: jest.fn(),
    },
    regulationPhrase: {
      findMany: jest.fn(),
    },
    exam: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    examQuestion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    examQuestionResponse: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const userStatsService = {
    registerFinishedExam: jest.fn(),
  };

  let service: ExamsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (t: typeof tx) => unknown)(tx)
        : Promise.all(arg as unknown[]),
    );
    prisma.examQuestionResponse.deleteMany.mockResolvedValue({ count: 0 });
    prisma.examQuestionResponse.createMany.mockResolvedValue({ count: 0 });
    tx.examQuestionResponse.deleteMany.mockResolvedValue({ count: 0 });
    tx.examQuestionResponse.createMany.mockResolvedValue({ count: 0 });
    service = new ExamsService(
      prisma as unknown as PrismaService,
      userStatsService as unknown as UserStatsService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('rejects answer when a pending final exam is already closed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-16T03:00:00.000Z'));
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      userId: 'user-1',
      status: ExamStatus.PENDING,
      examType: ExamType.FINAL,
      finalExamCatalog: {
        availableUntilDate: '2026-03-15',
      },
    });

    await expect(
      service.answer(
        'exam-1',
        { id: 'user-1', role: Role.GENERAL },
        { examQuestionId: 'question-1', selectedKeys: ['a'] },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects finish when a pending final exam is already closed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-16T03:00:00.000Z'));
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      userId: 'user-1',
      status: ExamStatus.PENDING,
      examType: ExamType.FINAL,
      finalExamCatalog: {
        availableUntilDate: '2026-03-15',
      },
      questions: [],
    });

    await expect(
      service.finish('exam-1', { id: 'user-1', role: Role.GENERAL }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('duplicates the finished exam to the paired partner on first attempt', async () => {
    const finishedAt = new Date('2026-04-01T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(finishedAt);

    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      userId: 'user-a',
      status: ExamStatus.PENDING,
      finalExamCatalogId: 'catalog-1',
      attemptNumber: 1,
      questionCount: 1,
      isTimed: false,
      totalTimeSeconds: null,
      examType: ExamType.FINAL,
      passThresholdPercent: 80,
      language: Language.EN,
      finalExamCatalog: { availableUntilDate: null },
      questions: [
        {
          position: 1,
          questionCode: '1.1',
          questionText: 'Question text',
          categoryName: 'Regla 1',
          options: [
            { position: 1, key: 'a', text: 'Option A' },
            { position: 2, key: 'b', text: 'Option B' },
          ],
          correctKeys: [{ key: 'a' }],
          responses: [{ key: 'a' }],
        },
      ],
    });

    tx.exam.update.mockResolvedValue({
      id: 'exam-1',
      status: ExamStatus.FINISHED,
      questionCount: 1,
      correctCount: 1,
      wrongCount: 0,
      scorePercent: 100,
      isPassed: true,
      finishedAt,
    });
    tx.finalExamCatalogPair.findFirst.mockResolvedValue({
      userAId: 'user-a',
      userBId: 'user-b',
    });
    tx.exam.count.mockResolvedValue(0);

    await service.finish('exam-1', { id: 'user-a', role: Role.GENERAL });

    expect(tx.exam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-b',
        finalExamCatalogId: 'catalog-1',
        attemptNumber: 1,
        status: ExamStatus.FINISHED,
        isPassed: true,
        scorePercent: 100,
        language: Language.EN,
        questions: {
          create: [
            expect.objectContaining({
              questionCode: '1.1',
              options: {
                create: [
                  { position: 1, key: 'a', text: 'Option A' },
                  { position: 2, key: 'b', text: 'Option B' },
                ],
              },
              correctKeys: { create: [{ key: 'a' }] },
              responses: { create: [{ key: 'a' }] },
            }),
          ],
        },
      }),
    });

    expect(userStatsService.registerFinishedExam).toHaveBeenCalledTimes(2);
    expect(userStatsService.registerFinishedExam).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-b', isPassed: true }),
      tx,
    );
  });

  it('does not duplicate the exam when the partner already has one for the catalog', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      userId: 'user-a',
      status: ExamStatus.PENDING,
      finalExamCatalogId: 'catalog-1',
      attemptNumber: 1,
      questionCount: 1,
      isTimed: false,
      totalTimeSeconds: null,
      examType: ExamType.FINAL,
      passThresholdPercent: 80,
      language: Language.EN,
      finalExamCatalog: { availableUntilDate: null },
      questions: [
        {
          position: 1,
          questionCode: '1.1',
          questionText: 'Question text',
          categoryName: 'Regla 1',
          options: [{ position: 1, key: 'a', text: 'Option A' }],
          correctKeys: [{ key: 'a' }],
          responses: [{ key: 'a' }],
        },
      ],
    });

    tx.exam.update.mockResolvedValue({
      id: 'exam-1',
      status: ExamStatus.FINISHED,
      questionCount: 1,
      correctCount: 1,
      wrongCount: 0,
      scorePercent: 100,
      isPassed: true,
      finishedAt: new Date('2026-04-01T10:00:00.000Z'),
    });
    tx.finalExamCatalogPair.findFirst.mockResolvedValue({
      userAId: 'user-a',
      userBId: 'user-b',
    });
    tx.exam.count.mockResolvedValue(1);

    await service.finish('exam-1', { id: 'user-a', role: Role.GENERAL });

    expect(tx.exam.create).not.toHaveBeenCalled();
    expect(userStatsService.registerFinishedExam).toHaveBeenCalledTimes(1);
  });

  it('persists shuffled option order for final exams when shuffleOptions is enabled', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Regla 1' },
    ]);
    prisma.question.findMany.mockResolvedValue([
      {
        code: 'Q-1',
        category: { name: 'Regla 1' },
        translations: [
          {
            text: 'Pregunta 1',
            answers: [
              { key: 'a', text: 'Opcion A' },
              { key: 'b', text: 'Opcion B' },
              { key: 'c', text: 'Opcion C' },
            ],
          },
        ],
        correctAnswerKeys: [{ key: 'b' }],
      },
    ]);
    prisma.exam.create.mockResolvedValue({ id: 'exam-1' });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'exam-1' } as never);
    jest.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0);

    await service.createGeneratedExam(
      { id: 'user-1', role: Role.GENERAL },
      {
        examType: ExamType.FINAL,
        questionCount: 1,
        categoryIds: ['cat-1'],
        isTimed: false,
        shuffleOptions: true,
        language: Language.ES,
      },
    );

    expect(prisma.exam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        questions: {
          create: [
            expect.objectContaining({
              options: {
                create: [
                  { position: 1, key: 'b', text: 'Opcion B' },
                  { position: 2, key: 'c', text: 'Opcion C' },
                  { position: 3, key: 'a', text: 'Opcion A' },
                ],
              },
            }),
          ],
        },
      }),
      select: { id: true },
    });
  });

  it('keeps original option order when shuffleOptions is disabled', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Regla 1' },
    ]);
    prisma.question.findMany.mockResolvedValue([
      {
        code: 'Q-1',
        category: { name: 'Regla 1' },
        translations: [
          {
            text: 'Pregunta 1',
            answers: [
              { key: 'a', text: 'Opcion A' },
              { key: 'b', text: 'Opcion B' },
              { key: 'c', text: 'Opcion C' },
            ],
          },
        ],
        correctAnswerKeys: [{ key: 'b' }],
      },
    ]);
    prisma.exam.create.mockResolvedValue({ id: 'exam-1' });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'exam-1' } as never);

    await service.createGeneratedExam(
      { id: 'user-1', role: Role.GENERAL },
      {
        examType: ExamType.FINAL,
        questionCount: 1,
        categoryIds: ['cat-1'],
        isTimed: false,
        shuffleOptions: false,
        language: Language.ES,
      },
    );

    expect(prisma.exam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        questions: {
          create: [
            expect.objectContaining({
              options: {
                create: [
                  { position: 1, key: 'a', text: 'Opcion A' },
                  { position: 2, key: 'b', text: 'Opcion B' },
                  { position: 3, key: 'c', text: 'Opcion C' },
                ],
              },
            }),
          ],
        },
      }),
      select: { id: true },
    });
  });

  it('loads exam options using persisted position order', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      userId: 'user-1',
      finalExamCatalogId: null,
      attemptNumber: null,
      questionCount: 1,
      isTimed: false,
      totalTimeSeconds: null,
      status: ExamStatus.PENDING,
      examType: ExamType.PRACTICE,
      passThresholdPercent: 80,
      correctCount: null,
      wrongCount: null,
      scorePercent: null,
      isPassed: null,
      createdAt: new Date('2026-03-20T12:00:00.000Z'),
      finishedAt: null,
      finalExamCatalog: null,
      questions: [],
    });

    await service.findOne('exam-1', { id: 'user-1', role: Role.GENERAL });

    expect(prisma.exam.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          questions: expect.objectContaining({
            include: expect.objectContaining({
              options: expect.objectContaining({
                orderBy: [{ position: 'asc' }, { id: 'asc' }],
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('builds phrase-based questions (no options) for SEARCH catalog kind', async () => {
    prisma.exam.create.mockResolvedValue({ id: 'exam-1' });
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'exam-1' } as never);

    await service.createGeneratedExam(
      { id: 'user-1', role: Role.GENERAL },
      {
        examType: ExamType.FINAL,
        questionCount: 1,
        categoryIds: [],
        isTimed: false,
        language: Language.ES,
        catalogKind: FinalExamCatalogKind.SEARCH,
        phrases: [
          {
            text: 'Los saques de banda deben sacarse pisando la línea lateral',
            answer: '7.8 b',
          },
        ],
      },
    );

    expect(prisma.category.findMany).not.toHaveBeenCalled();
    expect(prisma.exam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        catalogKind: FinalExamCatalogKind.SEARCH,
        questions: {
          create: [
            {
              position: 1,
              questionCode: 'phrase-1',
              questionText:
                'Los saques de banda deben sacarse pisando la línea lateral',
              categoryName: '7.8 b',
            },
          ],
        },
      }),
      select: { id: true },
    });
  });

  it('throws when a SEARCH catalog has no phrases configured', async () => {
    await expect(
      service.createGeneratedExam(
        { id: 'user-1', role: Role.GENERAL },
        {
          examType: ExamType.FINAL,
          questionCount: 1,
          categoryIds: [],
          isTimed: false,
          language: Language.ES,
          catalogKind: FinalExamCatalogKind.SEARCH,
          phrases: [],
        },
      ),
    ).rejects.toThrow('Final exam catalog has no phrases configured');
  });

  it('stores free-text answers for SEARCH catalog exams', async () => {
    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      userId: 'user-1',
      status: ExamStatus.PENDING,
      examType: ExamType.FINAL,
      catalogKind: FinalExamCatalogKind.SEARCH,
      finalExamCatalog: { availableUntilDate: null },
    });
    prisma.examQuestion.findFirst.mockResolvedValue({ id: 'question-1' });

    const result = await service.answer(
      'exam-1',
      { id: 'user-1', role: Role.GENERAL },
      { examQuestionId: 'question-1', freeText: 'Regla 5' },
    );

    expect(prisma.examQuestion.update).toHaveBeenCalledWith({
      where: { id: 'question-1' },
      data: { submittedText: 'Regla 5' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('grades SEARCH exams by normalizing free-text answers against the correct rule', async () => {
    const finishedAt = new Date('2026-05-01T10:00:00.000Z');
    jest.useFakeTimers().setSystemTime(finishedAt);

    prisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      userId: 'user-1',
      status: ExamStatus.PENDING,
      examType: ExamType.FINAL,
      catalogKind: FinalExamCatalogKind.SEARCH,
      passThresholdPercent: 80,
      finalExamCatalogId: null,
      attemptNumber: null,
      finalExamCatalog: null,
      questions: [
        { categoryName: '7.8 b', submittedText: '7.8 B' },
        { categoryName: '12', submittedText: '12' },
        { categoryName: '14.2', submittedText: '14 2' },
        { categoryName: '8.4', submittedText: '9.4' },
        { categoryName: '3', submittedText: '' },
      ],
    });

    tx.exam.update.mockResolvedValue({
      id: 'exam-1',
      status: ExamStatus.FINISHED,
      questionCount: 5,
      correctCount: 3,
      wrongCount: 2,
      scorePercent: 60,
      isPassed: false,
      finishedAt,
    });

    await service.finish('exam-1', { id: 'user-1', role: Role.GENERAL });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exam-1' },
        data: expect.objectContaining({
          correctCount: 3,
          wrongCount: 2,
          scorePercent: 60,
          isPassed: false,
        }),
      }),
    );
  });

  describe('answerBulk', () => {
    const user = { id: 'user-1', role: Role.GENERAL };

    it('upserts every catalog answer in one pass', async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.PRACTICE,
        catalogKind: FinalExamCatalogKind.CATALOG,
        finalExamCatalog: null,
      });
      prisma.examQuestion.findMany.mockResolvedValue([
        { id: 'q1', options: [{ key: 'a' }, { key: 'b' }] },
        { id: 'q2', options: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] },
      ]);

      const result = await service.answerBulk('exam-1', user, {
        answers: [
          { examQuestionId: 'q1', selectedKeys: ['a'] },
          { examQuestionId: 'q2', selectedKeys: ['b', 'c'] },
        ],
      });

      expect(result).toEqual({ ok: true, saved: 2, rejected: [] });
      expect(tx.examQuestionResponse.deleteMany).toHaveBeenCalledTimes(2);
      expect(tx.examQuestionResponse.createMany).toHaveBeenCalledWith({
        data: [
          { examQuestionId: 'q2', key: 'b' },
          { examQuestionId: 'q2', key: 'c' },
        ],
        skipDuplicates: true,
      });
    });

    it('clears the response when selectedKeys is empty (idempotent deselect)', async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.PRACTICE,
        catalogKind: FinalExamCatalogKind.CATALOG,
        finalExamCatalog: null,
      });
      prisma.examQuestion.findMany.mockResolvedValue([
        { id: 'q1', options: [{ key: 'a' }, { key: 'b' }] },
      ]);

      await service.answerBulk('exam-1', user, {
        answers: [{ examQuestionId: 'q1', selectedKeys: [] }],
      });

      expect(tx.examQuestionResponse.deleteMany).toHaveBeenCalledWith({
        where: { examQuestionId: 'q1' },
      });
      expect(tx.examQuestionResponse.createMany).not.toHaveBeenCalled();
    });

    it('reports an unknown option key as rejected and saves the valid answers', async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.PRACTICE,
        catalogKind: FinalExamCatalogKind.CATALOG,
        finalExamCatalog: null,
      });
      prisma.examQuestion.findMany.mockResolvedValue([
        { id: 'q1', options: [{ key: 'a' }, { key: 'b' }] },
        { id: 'q2', options: [{ key: 'a' }, { key: 'b' }] },
      ]);

      const result = await service.answerBulk('exam-1', user, {
        answers: [
          { examQuestionId: 'q1', selectedKeys: ['z'] },
          { examQuestionId: 'q2', selectedKeys: ['b'] },
        ],
      });

      expect(result).toEqual({
        ok: true,
        saved: 1,
        rejected: [{ examQuestionId: 'q1', reason: 'INVALID_KEY' }],
      });
      expect(tx.examQuestionResponse.deleteMany).toHaveBeenCalledTimes(1);
      expect(tx.examQuestionResponse.deleteMany).toHaveBeenCalledWith({
        where: { examQuestionId: 'q2' },
      });
    });

    it('reports a question that does not belong to the exam as rejected', async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.PRACTICE,
        catalogKind: FinalExamCatalogKind.CATALOG,
        finalExamCatalog: null,
      });
      prisma.examQuestion.findMany.mockResolvedValue([]);

      const result = await service.answerBulk('exam-1', user, {
        answers: [{ examQuestionId: 'ghost', selectedKeys: ['a'] }],
      });

      expect(result).toEqual({
        ok: true,
        saved: 0,
        rejected: [{ examQuestionId: 'ghost', reason: 'QUESTION_NOT_FOUND' }],
      });
      expect(tx.examQuestionResponse.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects when the exam is already finished', async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.FINISHED,
        examType: ExamType.PRACTICE,
        catalogKind: FinalExamCatalogKind.CATALOG,
        finalExamCatalog: null,
      });

      await expect(
        service.answerBulk('exam-1', user, {
          answers: [{ examQuestionId: 'q1', selectedKeys: ['a'] }],
        }),
      ).rejects.toThrow('Exam is already finished');
    });

    it('stores free-text for SEARCH exams', async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.FINAL,
        catalogKind: FinalExamCatalogKind.SEARCH,
        finalExamCatalog: { availableUntilDate: null },
      });
      prisma.examQuestion.findMany.mockResolvedValue([
        { id: 'q1', options: [] },
        { id: 'q2', options: [] },
      ]);

      const result = await service.answerBulk('exam-1', user, {
        answers: [
          { examQuestionId: 'q1', freeText: '  7.8 b ' },
          { examQuestionId: 'q2', freeText: '' },
        ],
      });

      expect(result).toEqual({ ok: true, saved: 2, rejected: [] });
      expect(prisma.examQuestion.update).toHaveBeenCalledWith({
        where: { id: 'q1' },
        data: { submittedText: '7.8 b' },
      });
      expect(prisma.examQuestion.update).toHaveBeenCalledWith({
        where: { id: 'q2' },
        data: { submittedText: null },
      });
    });
  });

  describe('finish reason', () => {
    it('closes a timed-out exam even with unanswered questions (score 0 points)', async () => {
      const finishedAt = new Date('2026-05-02T10:00:00.000Z');
      jest.useFakeTimers().setSystemTime(finishedAt);

      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.PRACTICE,
        catalogKind: FinalExamCatalogKind.CATALOG,
        passThresholdPercent: 80,
        finalExamCatalogId: null,
        attemptNumber: null,
        finalExamCatalog: null,
        questions: [
          {
            position: 1,
            questionCode: 'c1',
            questionText: 't1',
            categoryName: null,
            options: [{ position: 1, key: 'a', text: 'A' }],
            correctKeys: [{ key: 'a' }],
            responses: [{ key: 'a' }],
          },
          {
            position: 2,
            questionCode: 'c2',
            questionText: 't2',
            categoryName: null,
            options: [{ position: 1, key: 'a', text: 'A' }],
            correctKeys: [{ key: 'a' }],
            responses: [],
          },
        ],
      });
      tx.exam.update.mockResolvedValue({
        id: 'exam-1',
        status: ExamStatus.FINISHED,
        questionCount: 2,
        correctCount: 1,
        wrongCount: 1,
        scorePercent: 50,
        isPassed: false,
        finishedAt,
      });

      const result = await service.finish(
        'exam-1',
        { id: 'user-1', role: Role.GENERAL },
        { reason: 'TIMEOUT' },
      );

      expect(result.status).toBe(ExamStatus.FINISHED);
      expect(tx.exam.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            correctCount: 1,
            wrongCount: 1,
            scorePercent: 50,
          }),
        }),
      );
    });
  });

  describe('live progress', () => {
    const user = { id: 'user-1', role: Role.GENERAL };
    let bus: ExamActivityBus;
    let liveService: ExamsService;

    beforeEach(() => {
      bus = new ExamActivityBus();
      liveService = new ExamsService(
        prisma as unknown as PrismaService,
        userStatsService as unknown as UserStatsService,
        bus,
      );
    });

    it('publishes answered count and only the changed answers', async () => {
      const events: unknown[] = [];
      bus.events$.subscribe((event) => events.push(event));
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.FINAL,
        catalogKind: FinalExamCatalogKind.CATALOG,
        finalExamCatalogId: 'catalog-1',
        finalExamCatalog: { availableUntilDate: null },
      });
      prisma.examQuestion.findMany
        .mockResolvedValueOnce([{ id: 'q1', options: [{ key: 'a' }] }])
        .mockResolvedValueOnce([
          {
            id: 'q1',
            categoryName: null,
            submittedText: null,
            responses: [{ key: 'a' }],
            correctKeys: [{ key: 'a' }],
          },
          {
            id: 'q2',
            categoryName: null,
            submittedText: null,
            responses: [],
            correctKeys: [{ key: 'a' }],
          },
        ]);

      await liveService.answerBulk('exam-1', user, {
        answers: [{ examQuestionId: 'q1', selectedKeys: ['a'] }],
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(events).toEqual([
        {
          catalogId: 'catalog-1',
          userId: 'user-1',
          examId: 'exam-1',
          kind: 'PROGRESS',
          progress: {
            answered: 1,
            total: 2,
            scorePercent: 50,
            answers: [{ examQuestionId: 'q1', selectedKeys: ['a'] }],
          },
        },
      ]);
    });

    it('does not publish for practice exams', async () => {
      const events: unknown[] = [];
      bus.events$.subscribe((event) => events.push(event));
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.PRACTICE,
        catalogKind: FinalExamCatalogKind.CATALOG,
        finalExamCatalogId: null,
        finalExamCatalog: null,
      });
      prisma.examQuestion.findMany.mockResolvedValue([
        { id: 'q1', options: [{ key: 'a' }] },
      ]);

      await liveService.answerBulk('exam-1', user, {
        answers: [{ examQuestionId: 'q1', selectedKeys: ['a'] }],
      });
      await new Promise((resolve) => setImmediate(resolve));

      expect(events).toEqual([]);
    });

    it('never fails the save when publishing breaks', async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.PENDING,
        examType: ExamType.FINAL,
        catalogKind: FinalExamCatalogKind.CATALOG,
        finalExamCatalogId: 'catalog-1',
        finalExamCatalog: { availableUntilDate: null },
      });
      prisma.examQuestion.findMany
        .mockResolvedValueOnce([{ id: 'q1', options: [{ key: 'a' }] }])
        .mockRejectedValueOnce(new Error('db down'));

      await expect(
        liveService.answerBulk('exam-1', user, {
          answers: [{ examQuestionId: 'q1', selectedKeys: ['a'] }],
        }),
      ).resolves.toMatchObject({ ok: true, saved: 1 });
    });

    it('partialScorePercent: right answers add 1, wrong ones subtract (min 0 per question), unanswered adds 0', () => {
      const question = (correct: string[], selected: string[]) => ({
        categoryName: null,
        submittedText: null,
        correctKeys: correct.map((key) => ({ key })),
        responses: selected.map((key) => ({ key })),
      });

      expect(
        liveService.partialScorePercent(FinalExamCatalogKind.CATALOG, [
          question(['a'], ['a']), // acierta
          question(['a'], ['b']), // erra: no suma
          question(['a'], []), // sin responder: no suma
          question(['a'], ['a']), // acierta
        ]),
      ).toBe(50);
      expect(
        liveService.partialScorePercent(FinalExamCatalogKind.CATALOG, []),
      ).toBe(0);
    });

    it('partialScorePercent grades multi-answer questions per question, never below 0', () => {
      const question = (correct: string[], selected: string[]) => ({
        categoryName: null,
        submittedText: null,
        correctKeys: correct.map((key) => ({ key })),
        responses: selected.map((key) => ({ key })),
      });

      // Total del examen = 2 + 1 + 2 + 1 = 6 respuestas correctas.
      const score = liveService.partialScorePercent(
        FinalExamCatalogKind.CATALOG,
        [
          question(['a', 'b'], ['a', 'b']), // 2 aciertos          -> +2
          question(['a'], ['b', 'c']), // 2 errores            -> 0 (no resta)
          question(['a', 'b'], ['a', 'c']), // 1 acierto - 1 error -> 0
          question(['a'], []), // sin marcar            -> 0, sigue en el total
        ],
      );

      expect(score).toBe(33.33); // 2 / 6
    });

    it('partialScorePercent matches the score used when the exam closes', () => {
      const questions = [
        {
          categoryName: null,
          submittedText: null,
          correctKeys: [{ key: 'a' }, { key: 'b' }],
          responses: [{ key: 'a' }, { key: 'c' }],
        },
        {
          categoryName: null,
          submittedText: null,
          correctKeys: [{ key: 'a' }],
          responses: [{ key: 'a' }],
        },
      ];

      // 1 - 1 = 0 en la primera + 1 en la segunda, sobre un total de 3.
      expect(
        liveService.partialScorePercent(
          FinalExamCatalogKind.CATALOG,
          questions,
        ),
      ).toBe(33.33);
    });

    it('findLive returns the partial answers with the correct keys', async () => {
      prisma.exam.findUnique.mockResolvedValue({
        id: 'exam-1',
        status: ExamStatus.PENDING,
        catalogKind: FinalExamCatalogKind.CATALOG,
        questionCount: 2,
        isTimed: false,
        totalTimeSeconds: null,
        createdAt: new Date('2026-03-04T10:00:00.000Z'),
        finishedAt: null,
        scorePercent: null,
        isPassed: null,
        user: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.c' },
        questions: [
          {
            id: 'q1',
            position: 1,
            questionText: 'P1',
            categoryName: null,
            submittedText: null,
            options: [
              { key: 'a', text: 'A' },
              { key: 'b', text: 'B' },
            ],
            correctKeys: [{ key: 'a' }],
            responses: [{ key: 'b' }],
          },
          {
            id: 'q2',
            position: 2,
            questionText: 'P2',
            categoryName: null,
            submittedText: null,
            options: [{ key: 'a', text: 'A' }],
            correctKeys: [{ key: 'a' }],
            responses: [],
          },
        ],
      });

      const result = await service.findLive('exam-1');

      expect(result.answeredCount).toBe(1);
      expect(result.partialScorePercent).toBe(0);
      expect(result.questions[0]).toMatchObject({
        selectedKeys: ['b'],
        options: [
          { key: 'a', isCorrect: true },
          { key: 'b', isCorrect: false },
        ],
      });
      expect(result.questions[1].selectedKeys).toEqual([]);
    });
  });
});
