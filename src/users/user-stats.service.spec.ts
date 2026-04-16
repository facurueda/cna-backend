import { ExamType } from '@prisma/client';
import { UserStatsService } from './user-stats.service';

describe('UserStatsService', () => {
  const tx = {
    userStats: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const prisma = {
    userStats: tx.userStats,
    $transaction: jest.fn(),
  };

  let service: UserStatsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (callback: (innerTx: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );
    service = new UserStatsService(prisma as never);
  });

  it('creates stats row on first finished practice exam', async () => {
    tx.userStats.findUnique.mockResolvedValue(null);

    await service.registerFinishedExam({
      userId: 'user-1',
      examType: ExamType.PRACTICE,
      scorePercent: 84,
      isPassed: true,
    });

    expect(tx.userStats.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        practiceTestsCount: 1,
        practiceAverage: 8.4,
        finalTestsTotalCount: 0,
        finalTestsPassedCount: 0,
        finalAverage: 0,
      },
    });
  });

  it('updates simple average on subsequent practice exams', async () => {
    tx.userStats.findUnique.mockResolvedValue({
      userId: 'user-1',
      practiceTestsCount: 2,
      practiceAverage: 7,
      finalTestsPassedCount: 0,
      finalTestsTotalCount: 0,
      finalAverage: 0,
    });

    await service.registerFinishedExam({
      userId: 'user-1',
      examType: ExamType.PRACTICE,
      scorePercent: 85,
      isPassed: true,
    });

    expect(tx.userStats.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        practiceTestsCount: 3,
        practiceAverage: 7.5,
      },
    });
  });

  it('updates final counters and average', async () => {
    tx.userStats.findUnique.mockResolvedValue({
      userId: 'user-1',
      practiceTestsCount: 0,
      practiceAverage: 0,
      finalTestsPassedCount: 2,
      finalTestsTotalCount: 3,
      finalAverage: 8,
    });

    await service.registerFinishedExam({
      userId: 'user-1',
      examType: ExamType.FINAL,
      scorePercent: 90,
      isPassed: false,
    });

    expect(tx.userStats.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        finalTestsTotalCount: 4,
        finalTestsPassedCount: 2,
        finalAverage: 8.25,
      },
    });
  });

  it('increments clip counter', async () => {
    await service.incrementClips('user-1', 3);

    expect(tx.userStats.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: {
        userId: 'user-1',
        clipsCount: 3,
      },
      update: {
        clipsCount: { increment: 3 },
      },
    });
  });
});
