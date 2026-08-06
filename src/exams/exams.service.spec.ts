import { ConflictException } from '@nestjs/common';
import {
  ExamStatus,
  ExamType,
  FinalExamCatalogKind,
  Language,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
      update: jest.fn(),
    },
  };

  const userStatsService = {
    registerFinishedExam: jest.fn(),
  };

  let service: ExamsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
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
});
