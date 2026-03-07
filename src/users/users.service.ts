import { Injectable, NotFoundException } from "@nestjs/common";
import { ExamStatus, ExamType, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type RefereeStats = {
  practiceTestsCount: number;
  practiceAverage: number;
  finalTestsPassedCount: number;
  finalTestsTotalCount: number;
  finalAverage: number;
  clipsCount: number;
  commentsCount: number;
};

const EMPTY_STATS: RefereeStats = {
  practiceTestsCount: 0,
  practiceAverage: 0,
  finalTestsPassedCount: 0,
  finalTestsTotalCount: 0,
  finalAverage: 0,
  clipsCount: 0,
  commentsCount: 0,
};

const MONTH_LABELS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

type FinalEvolutionRow = {
  monthStart: Date;
  avgScorePercent: number | string | null;
  examsCount: number | bigint | string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listReferees(competitionId?: string) {
    if (competitionId) {
      const exists = await this.prisma.competition.findUnique({
        where: { id: competitionId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException("Competition not found");
    }

    const referees = await this.prisma.user.findMany({
      where: {
        role: { not: Role.ADMIN },
        ...(competitionId
          ? { competitionsAsReferee: { none: { competitionId } } }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        stats: {
          select: {
            practiceTestsCount: true,
            practiceAverage: true,
            finalTestsPassedCount: true,
            finalTestsTotalCount: true,
            finalAverage: true,
            clipsCount: true,
            commentsCount: true,
          },
        },
      },
    });

    return referees.map((referee) => ({
      id: referee.id,
      email: referee.email,
      firstName: referee.firstName,
      lastName: referee.lastName,
      role: referee.role,
      ...(referee.stats ?? EMPTY_STATS),
    }));
  }

  async getDashboardSummary() {
    const [refereesCount, practiceTestsCount, finalExamAvg, clipsUploadedCount] =
      await Promise.all([
        this.prisma.user.count({
          where: { role: { not: Role.ADMIN } },
        }),
        this.prisma.exam.count({
          where: {
            status: ExamStatus.FINISHED,
            examType: ExamType.PRACTICE,
          },
        }),
        this.prisma.exam.aggregate({
          where: {
            status: ExamStatus.FINISHED,
            examType: ExamType.FINAL,
          },
          _avg: { scorePercent: true },
        }),
        this.prisma.clip.count(),
      ]);

    return {
      refereesCount,
      practiceTestsCount,
      finalAverageGlobal: this.percentToTenScale(finalExamAvg._avg.scorePercent),
      clipsUploadedCount,
    };
  }

  async getFinalEvolution(months?: number) {
    const windowSize = this.normalizeWindowSize(months);
    const now = new Date();
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const startMonth = new Date(
      Date.UTC(
        currentMonthStart.getUTCFullYear(),
        currentMonthStart.getUTCMonth() - (windowSize - 1),
        1,
      ),
    );
    const endMonthExclusive = new Date(
      Date.UTC(
        currentMonthStart.getUTCFullYear(),
        currentMonthStart.getUTCMonth() + 1,
        1,
      ),
    );

    const rows = await this.prisma.$queryRaw<FinalEvolutionRow[]>`
      SELECT
        date_trunc('month', "finishedAt") AS "monthStart",
        AVG("scorePercent") AS "avgScorePercent",
        COUNT(*)::int AS "examsCount"
      FROM "Exam"
      WHERE "status"::text = ${ExamStatus.FINISHED}
        AND "examType"::text = ${ExamType.FINAL}
        AND "finishedAt" IS NOT NULL
        AND "finishedAt" >= ${startMonth}
        AND "finishedAt" < ${endMonthExclusive}
      GROUP BY "monthStart"
      ORDER BY "monthStart" ASC
    `;

    const rowsByMonth = new Map(
      rows.map((row) => {
        const key = this.monthKey(new Date(row.monthStart));
        return [
          key,
          {
            average: this.percentToTenScale(
              row.avgScorePercent == null ? null : Number(row.avgScorePercent),
            ),
            examsCount: Number(row.examsCount),
          },
        ];
      }),
    );

    const monthsSeries = Array.from({ length: windowSize }, (_, index) => {
      const monthDate = new Date(
        Date.UTC(
          startMonth.getUTCFullYear(),
          startMonth.getUTCMonth() + index,
          1,
        ),
      );
      const key = this.monthKey(monthDate);
      const existing = rowsByMonth.get(key);

      return {
        month: key,
        label: MONTH_LABELS[monthDate.getUTCMonth()],
        average: existing?.average ?? null,
        examsCount: existing?.examsCount ?? 0,
      };
    });

    return { months: monthsSeries };
  }

  private percentToTenScale(value: number | null | undefined) {
    if (value == null) return 0;
    return Number((value / 10).toFixed(1));
  }

  private monthKey(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  private normalizeWindowSize(value?: number) {
    if (value == null || !Number.isFinite(value)) return 6;
    const normalized = Math.trunc(value);
    if (normalized < 1) return 1;
    if (normalized > 24) return 24;
    return normalized;
  }
}
