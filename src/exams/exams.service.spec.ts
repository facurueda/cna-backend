import { ConflictException } from '@nestjs/common';
import { ExamStatus, ExamType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatsService } from '../users/user-stats.service';
import { ExamsService } from './exams.service';

describe('ExamsService', () => {
  const tx = {
    exam: {
      create: jest.fn(),
      update: jest.fn(),
    },
    examQuestion: {
      create: jest.fn(),
    },
    examQuestionResponse: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
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
    exam: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    examQuestion: {
      findFirst: jest.fn(),
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

  it('persists shuffled option order for final exams when shuffleOptions is enabled', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Regla 1' },
    ]);
    prisma.question.findMany.mockResolvedValue([
      {
        code: 'Q-1',
        text: 'Pregunta 1',
        category: { name: 'Regla 1' },
        answers: [
          { key: 'a', text: 'Opcion A' },
          { key: 'b', text: 'Opcion B' },
          { key: 'c', text: 'Opcion C' },
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
        text: 'Pregunta 1',
        category: { name: 'Regla 1' },
        answers: [
          { key: 'a', text: 'Opcion A' },
          { key: 'b', text: 'Opcion B' },
          { key: 'c', text: 'Opcion C' },
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
      passThresholdPercent: 70,
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
});
