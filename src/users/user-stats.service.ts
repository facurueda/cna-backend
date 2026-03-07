import { Injectable } from '@nestjs/common';
import { ExamType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type StatsClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class UserStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerFinishedExam(
    params: {
      userId: string;
      examType: ExamType;
      scorePercent: number;
      isPassed: boolean;
    },
    tx?: Prisma.TransactionClient,
  ) {
    if (tx) {
      await this.registerFinishedExamInTx(params, tx);
      return;
    }

    await this.prisma.$transaction(async (innerTx) => {
      await this.registerFinishedExamInTx(params, innerTx);
    });
  }

  async incrementClips(
    userId: string,
    amount = 1,
    tx?: Prisma.TransactionClient,
  ) {
    if (amount <= 0) return;
    const client: StatsClient = tx ?? this.prisma;

    await client.userStats.upsert({
      where: { userId },
      create: {
        userId,
        clipsCount: amount,
      },
      update: {
        clipsCount: { increment: amount },
      },
    });
  }

  async incrementComments(
    userId: string,
    amount = 1,
    tx?: Prisma.TransactionClient,
  ) {
    if (amount <= 0) return;
    const client: StatsClient = tx ?? this.prisma;

    await client.userStats.upsert({
      where: { userId },
      create: {
        userId,
        commentsCount: amount,
      },
      update: {
        commentsCount: { increment: amount },
      },
    });
  }

  private async registerFinishedExamInTx(
    params: {
      userId: string;
      examType: ExamType;
      scorePercent: number;
      isPassed: boolean;
    },
    tx: Prisma.TransactionClient,
  ) {
    const scoreOnTen = this.toTenScale(params.scorePercent);
    const current = await tx.userStats.findUnique({
      where: { userId: params.userId },
      select: {
        userId: true,
        practiceTestsCount: true,
        practiceAverage: true,
        finalTestsPassedCount: true,
        finalTestsTotalCount: true,
        finalAverage: true,
      },
    });

    if (!current) {
      await tx.userStats.create({
        data: {
          userId: params.userId,
          practiceTestsCount: params.examType === ExamType.PRACTICE ? 1 : 0,
          practiceAverage: params.examType === ExamType.PRACTICE ? scoreOnTen : 0,
          finalTestsTotalCount: params.examType === ExamType.FINAL ? 1 : 0,
          finalTestsPassedCount:
            params.examType === ExamType.FINAL && params.isPassed ? 1 : 0,
          finalAverage: params.examType === ExamType.FINAL ? scoreOnTen : 0,
        },
      });
      return;
    }

    if (params.examType === ExamType.PRACTICE) {
      const nextCount = current.practiceTestsCount + 1;
      const nextAverage = this.roundAverage(
        (current.practiceAverage * current.practiceTestsCount + scoreOnTen) /
          nextCount,
      );

      await tx.userStats.update({
        where: { userId: params.userId },
        data: {
          practiceTestsCount: nextCount,
          practiceAverage: nextAverage,
        },
      });

      return;
    }

    const nextTotalCount = current.finalTestsTotalCount + 1;
    const nextAverage = this.roundAverage(
      (current.finalAverage * current.finalTestsTotalCount + scoreOnTen) /
        nextTotalCount,
    );

    await tx.userStats.update({
      where: { userId: params.userId },
      data: {
        finalTestsTotalCount: nextTotalCount,
        finalTestsPassedCount:
          current.finalTestsPassedCount + (params.isPassed ? 1 : 0),
        finalAverage: nextAverage,
      },
    });
  }

  private toTenScale(scorePercent: number) {
    return Number((scorePercent / 10).toFixed(2));
  }

  private roundAverage(value: number) {
    return Number(value.toFixed(2));
  }
}
