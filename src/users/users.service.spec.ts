import { NotFoundException } from "@nestjs/common";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const prisma = {
    competition: { findUnique: jest.fn() },
    user: { findMany: jest.fn(), count: jest.fn() },
    exam: { count: jest.fn(), aggregate: jest.fn() },
    clip: { count: jest.fn() },
    $queryRaw: jest.fn(),
  };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-02-15T12:00:00.000Z"));
    service = new UsersService(prisma as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("throws when competition does not exist", async () => {
    prisma.competition.findUnique.mockResolvedValue(null);

    await expect(service.listReferees("competition-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("returns assignable users with persisted stats and zero fallback", async () => {
    prisma.competition.findUnique.mockResolvedValue({ id: "competition-1" });
    prisma.user.findMany.mockResolvedValue([
      {
        id: "u-1",
        email: "u1@test.com",
        firstName: "U1",
        lastName: "One",
        role: "GENERAL",
        stats: {
          practiceTestsCount: 8,
          practiceAverage: 7.6,
          finalTestsPassedCount: 5,
          finalTestsTotalCount: 6,
          finalAverage: 8.4,
          clipsCount: 12,
        },
      },
      {
        id: "u-2",
        email: "u2@test.com",
        firstName: "U2",
        lastName: "Two",
        role: "GENERAL",
        stats: null,
      },
      {
        id: "admin-1",
        email: "admin@test.com",
        firstName: "Admin",
        lastName: "User",
        role: "ADMIN",
        stats: {
          practiceTestsCount: 1,
          practiceAverage: 6.5,
          finalTestsPassedCount: 1,
          finalTestsTotalCount: 1,
          finalAverage: 9.2,
          clipsCount: 4,
        },
      },
    ]);

    const result = await service.listReferees("competition-1");

    expect(result).toEqual([
      {
        id: "u-1",
        email: "u1@test.com",
        firstName: "U1",
        lastName: "One",
        role: "GENERAL",
        practiceTestsCount: 8,
        practiceAverage: 7.6,
        finalTestsPassedCount: 5,
        finalTestsTotalCount: 6,
        finalAverage: 8.4,
        clipsCount: 12,
      },
      {
        id: "u-2",
        email: "u2@test.com",
        firstName: "U2",
        lastName: "Two",
        role: "GENERAL",
        practiceTestsCount: 0,
        practiceAverage: 0,
        finalTestsPassedCount: 0,
        finalTestsTotalCount: 0,
        finalAverage: 0,
        clipsCount: 0,
      },
      {
        id: "admin-1",
        email: "admin@test.com",
        firstName: "Admin",
        lastName: "User",
        role: "ADMIN",
        practiceTestsCount: 1,
        practiceAverage: 6.5,
        finalTestsPassedCount: 1,
        finalTestsTotalCount: 1,
        finalAverage: 9.2,
        clipsCount: 4,
      },
    ]);
  });

  it("includes admins when listing users available for assignment", async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await service.listReferees();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
    );
  });

  it("returns dashboard summary cards", async () => {
    prisma.user.count.mockResolvedValue(128);
    prisma.exam.count.mockResolvedValue(450);
    prisma.exam.aggregate.mockResolvedValue({ _avg: { scorePercent: 82 } });
    prisma.clip.count.mockResolvedValue(320);

    const result = await service.getDashboardSummary();

    expect(prisma.user.count).toHaveBeenCalledWith();
    expect(result).toEqual({
      refereesCount: 128,
      practiceTestsCount: 450,
      finalAverageGlobal: 8.2,
      clipsUploadedCount: 320,
    });
  });

  it("returns global monthly final evolution using finishedAt", async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        monthStart: new Date("2025-10-01T00:00:00.000Z"),
        avgScorePercent: 78,
        examsCount: 2,
      },
      {
        monthStart: new Date("2025-12-01T00:00:00.000Z"),
        avgScorePercent: "84",
        examsCount: "1",
      },
    ]);

    const result = await service.getFinalEvolution(6);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      months: [
        { month: "2025-09", label: "Sep", average: null, examsCount: 0 },
        { month: "2025-10", label: "Oct", average: 7.8, examsCount: 2 },
        { month: "2025-11", label: "Nov", average: null, examsCount: 0 },
        { month: "2025-12", label: "Dic", average: 8.4, examsCount: 1 },
        { month: "2026-01", label: "Ene", average: null, examsCount: 0 },
        { month: "2026-02", label: "Feb", average: null, examsCount: 0 },
      ],
    });
  });

  it("normalizes invalid window size for final evolution", async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.getFinalEvolution(0);

    expect(result.months).toHaveLength(1);
    expect(result.months[0].month).toBe("2026-02");
  });
});
