import { ConflictException } from '@nestjs/common';
import { ExamStatus, ExamType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatsService } from '../users/user-stats.service';
import { ExamsService } from './exams.service';

describe('ExamsService final exam availability', () => {
  const prisma = {
    exam: {
      findUnique: jest.fn(),
    },
  };

  const userStatsService = {
    registerFinishedExam: jest.fn(),
  };

  let service: ExamsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExamsService(
      prisma as unknown as PrismaService,
      userStatsService as unknown as UserStatsService,
    );
  });

  afterEach(() => {
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
});
