import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExamStatus,
  ExamType,
  FinalExamCatalogStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { ExamsService } from '../exams/exams.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinalExamCatalogDto } from './dto/create-final-exam-catalog.dto';

type AuthUserPayload = {
  id: string;
  role: Role;
};

@Injectable()
export class FinalExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly examsService: ExamsService,
  ) {}

  async createCatalog(user: AuthUserPayload, dto: CreateFinalExamCatalogDto) {
    this.validateTimerFields(dto);

    const categoryIds = this.normalizeUniqueTextValues(dto.categoryIds);
    const competitionIds = this.normalizeUniqueTextValues(dto.competitionIds);
    const [categories, competitions] = await Promise.all([
      this.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      }),
      this.prisma.competition.findMany({
        where: { id: { in: competitionIds } },
        select: { id: true, name: true },
      }),
    ]);

    if (categories.length !== categoryIds.length) {
      const existing = new Set(categories.map((category) => category.id));
      const missing = categoryIds.filter((id) => !existing.has(id));
      throw new NotFoundException(
        `Category not found for final exam catalog: ${missing.join(', ')}`,
      );
    }

    if (competitions.length !== competitionIds.length) {
      const existing = new Set(competitions.map((competition) => competition.id));
      const missing = competitionIds.filter((id) => !existing.has(id));
      throw new NotFoundException(
        `Competition not found for final exam catalog: ${missing.join(', ')}`,
      );
    }

    const created = await this.prisma.finalExamCatalog.create({
      data: {
        title: dto.title?.trim() || 'Examen',
        questionCount: dto.questionCount,
        isTimed: dto.isTimed,
        totalTimeSeconds: dto.isTimed ? dto.totalTimeSeconds ?? null : null,
        maxRetries: dto.maxRetries ?? 0,
        shuffleOptions: dto.shuffleOptions ?? true,
        passThresholdPercent: dto.passThresholdPercent ?? 70,
        status: FinalExamCatalogStatus.DRAFT,
        publishedAt: null,
        createdById: user.id,
        categories: {
          createMany: {
            data: categoryIds.map((categoryId) => ({ categoryId })),
            skipDuplicates: true,
          },
        },
        competitions: {
          createMany: {
            data: competitionIds.map((competitionId) => ({ competitionId })),
            skipDuplicates: true,
          },
        },
      },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        competitions: {
          include: {
            competition: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      id: created.id,
      title: created.title,
      status: created.status,
      questionCount: created.questionCount,
      isTimed: created.isTimed,
      totalTimeSeconds: created.totalTimeSeconds,
      maxRetries: created.maxRetries,
      maxAttempts: this.toMaxAttempts(created.maxRetries),
      shuffleOptions: created.shuffleOptions,
      passThresholdPercent: created.passThresholdPercent,
      publishedAt: created.publishedAt,
      createdAt: created.createdAt,
      categories: created.categories.map((item) => item.category),
      competitions: created.competitions.map((item) => item.competition),
    };
  }

  async publishCatalog(id: string) {
    const catalog = await this.prisma.finalExamCatalog.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        publishedAt: true,
      },
    });

    if (!catalog) throw new NotFoundException('Final exam catalog not found');

    if (catalog.status === FinalExamCatalogStatus.PUBLISHED) {
      return this.getCatalogById(id);
    }

    await this.prisma.finalExamCatalog.update({
      where: { id },
      data: {
        status: FinalExamCatalogStatus.PUBLISHED,
        publishedAt: catalog.publishedAt ?? new Date(),
      },
    });

    return this.getCatalogById(id);
  }

  async listMyCatalogs(user: AuthUserPayload) {
    const catalogs = await this.prisma.finalExamCatalog.findMany({
      where:
        user.role === Role.ADMIN
          ? undefined
          : {
              status: FinalExamCatalogStatus.PUBLISHED,
              competitions: {
                some: {
                  competition: {
                    referees: {
                      some: { userId: user.id },
                    },
                  },
                },
              },
            },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        categories: {
          include: { category: { select: { id: true, name: true } } },
        },
        competitions: {
          include: { competition: { select: { id: true, name: true } } },
        },
        exams: {
          where: { userId: user.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            status: true,
            isPassed: true,
            scorePercent: true,
            attemptNumber: true,
            createdAt: true,
            finishedAt: true,
          },
        },
      },
    });

    return catalogs.map((catalog) => {
      const maxAttempts = this.toMaxAttempts(catalog.maxRetries);
      const usedAttempts = catalog.exams.length;
      const hasPendingAttempt = catalog.exams.some(
        (exam) => exam.status === ExamStatus.PENDING,
      );
      const pendingAttemptId =
        catalog.exams.find((exam) => exam.status === ExamStatus.PENDING)?.id ??
        null;
      const hasPassed = catalog.exams.some((exam) => exam.isPassed === true);
      const remainingAttempts = hasPassed
        ? 0
        : Math.max(0, maxAttempts - usedAttempts);
      const lastFinished =
        catalog.exams.find((exam) => exam.status === ExamStatus.FINISHED) ?? null;

      return {
        id: catalog.id,
        title: catalog.title,
        status: catalog.status,
        questionCount: catalog.questionCount,
        isTimed: catalog.isTimed,
        totalTimeSeconds: catalog.totalTimeSeconds,
        maxRetries: catalog.maxRetries,
        maxAttempts,
        shuffleOptions: catalog.shuffleOptions,
        passThresholdPercent: catalog.passThresholdPercent,
        publishedAt: catalog.publishedAt,
        createdAt: catalog.createdAt,
        categories: catalog.categories.map((item) => item.category),
        competitions: catalog.competitions.map((item) => item.competition),
        myAttempts: {
          usedAttempts,
          remainingAttempts,
          hasPendingAttempt,
          pendingAttemptId,
          hasPassed,
          lastScorePercent: lastFinished?.scorePercent ?? null,
          lastFinishedAt: lastFinished?.finishedAt ?? null,
        },
      };
    });
  }

  async listCatalogReferees(id: string) {
    const catalog = await this.prisma.finalExamCatalog.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        status: true,
        questionCount: true,
        maxRetries: true,
        createdAt: true,
        competitions: {
          select: {
            competitionId: true,
            competition: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!catalog) throw new NotFoundException('Final exam catalog not found');

    const competitions = Array.from(
      new Map(
        catalog.competitions.map((item) => [
          item.competition.id,
          { id: item.competition.id, name: item.competition.name },
        ]),
      ).values(),
    );
    const competitionIds = Array.from(
      new Set(catalog.competitions.map((item) => item.competitionId)),
    );
    const maxAttempts = this.toMaxAttempts(catalog.maxRetries);

    if (!competitionIds.length) {
      return {
        id: catalog.id,
        title: catalog.title,
        status: catalog.status,
        createdAt: catalog.createdAt,
        questionCount: catalog.questionCount,
        maxRetries: catalog.maxRetries,
        maxAttempts,
        competitions,
        summary: {
          resolutions: { resolved: 0, total: 0 },
          averageScoreOnTen: null,
          approved: { count: 0, totalResolved: 0 },
          pending: 0,
        },
        referees: [],
      };
    }

    const links = await this.prisma.competitionReferee.findMany({
      where: {
        competitionId: { in: competitionIds },
        user: { role: { not: Role.ADMIN } },
      },
      select: {
        userId: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const userById = new Map(
      links.map((link) => [
        link.userId,
        {
          id: link.user.id,
          firstName: link.user.firstName,
          lastName: link.user.lastName,
          email: link.user.email,
        },
      ]),
    );
    const users = Array.from(userById.values()).sort((a, b) => {
      const byLastName = a.lastName.localeCompare(b.lastName);
      if (byLastName !== 0) return byLastName;
      return a.firstName.localeCompare(b.firstName);
    });

    const userIds = users.map((user) => user.id);
    const exams = userIds.length
      ? await this.prisma.exam.findMany({
          where: {
            finalExamCatalogId: catalog.id,
            userId: { in: userIds },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            userId: true,
            status: true,
            isPassed: true,
            scorePercent: true,
            attemptNumber: true,
            createdAt: true,
            finishedAt: true,
          },
        })
      : [];

    const examsByUser = new Map<string, typeof exams>();
    for (const exam of exams) {
      const current = examsByUser.get(exam.userId) ?? [];
      current.push(exam);
      examsByUser.set(exam.userId, current);
    }

    const referees = users.map((user) => {
      const userExams = examsByUser.get(user.id) ?? [];
      const usedAttempts = userExams.length;
      const pendingAttempt =
        userExams.find((exam) => exam.status === ExamStatus.PENDING) ?? null;
      const hasPassed = userExams.some((exam) => exam.isPassed === true);
      const lastFinished =
        userExams.find((exam) => exam.status === ExamStatus.FINISHED) ?? null;
      const remainingAttempts = hasPassed
        ? 0
        : Math.max(0, maxAttempts - usedAttempts);

      return {
        user,
        date: lastFinished?.finishedAt ?? null,
        result: {
          scorePercent: lastFinished?.scorePercent ?? null,
          scoreOnTen: this.toTenScale(lastFinished?.scorePercent),
        },
        retries: {
          used: usedAttempts,
          max: maxAttempts,
          remaining: remainingAttempts,
        },
        status: hasPassed
          ? 'APPROVED'
          : pendingAttempt || usedAttempts < maxAttempts
            ? 'PENDING'
            : 'FAILED',
      };
    });

    const resolvedReferees = referees.filter((referee) => referee.status !== 'PENDING');
    const approvedCount = referees.filter(
      (referee) => referee.status === 'APPROVED',
    ).length;
    const pendingCount = referees.filter(
      (referee) => referee.status === 'PENDING',
    ).length;
    const averageScoreOnTen =
      resolvedReferees.length > 0
        ? Number(
            (
              resolvedReferees.reduce(
                (sum, referee) => sum + (referee.result.scoreOnTen ?? 0),
                0,
              ) / resolvedReferees.length
            ).toFixed(2),
          )
        : null;

    return {
      id: catalog.id,
      title: catalog.title,
      status: catalog.status,
      createdAt: catalog.createdAt,
      questionCount: catalog.questionCount,
      maxRetries: catalog.maxRetries,
      maxAttempts,
      competitions,
      summary: {
        resolutions: {
          resolved: resolvedReferees.length,
          total: referees.length,
        },
        averageScoreOnTen,
        approved: {
          count: approvedCount,
          totalResolved: resolvedReferees.length,
        },
        pending: pendingCount,
      },
      referees,
    };
  }

  async startAttempt(id: string, user: AuthUserPayload) {
    const catalog = await this.prisma.finalExamCatalog.findUnique({
      where: { id },
      include: {
        categories: {
          select: { categoryId: true },
        },
        competitions: {
          select: { competitionId: true },
        },
      },
    });

    if (!catalog) throw new NotFoundException('Final exam catalog not found');
    if (!catalog.categories.length) {
      throw new BadRequestException('Final exam catalog has no categories');
    }

    if (catalog.status !== FinalExamCatalogStatus.PUBLISHED && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Final exam catalog is not published');
    }

    if (user.role !== Role.ADMIN) {
      const competitionIds = catalog.competitions.map((item) => item.competitionId);
      const assignment = await this.prisma.competitionReferee.findFirst({
        where: {
          userId: user.id,
          competitionId: { in: competitionIds },
        },
        select: { competitionId: true },
      });

      if (!assignment) {
        throw new ForbiddenException(
          'You do not have access to this final exam catalog',
        );
      }
    }

    const pendingAttempt = await this.prisma.exam.findFirst({
      where: {
        userId: user.id,
        finalExamCatalogId: catalog.id,
        status: ExamStatus.PENDING,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });

    if (pendingAttempt) {
      return this.examsService.findOne(pendingAttempt.id, user);
    }

    const alreadyPassed = await this.prisma.exam.findFirst({
      where: {
        userId: user.id,
        finalExamCatalogId: catalog.id,
        status: ExamStatus.FINISHED,
        isPassed: true,
      },
      select: { id: true },
    });

    if (alreadyPassed) {
      throw new ConflictException('Final exam already approved');
    }

    const usedAttempts = await this.prisma.exam.count({
      where: {
        userId: user.id,
        finalExamCatalogId: catalog.id,
      },
    });
    const maxAttempts = this.toMaxAttempts(catalog.maxRetries);
    if (usedAttempts >= maxAttempts) {
      throw new ConflictException('No attempts remaining for this final exam');
    }

    try {
      return await this.examsService.createGeneratedExam(user, {
        examType: ExamType.FINAL,
        questionCount: catalog.questionCount,
        categoryIds: catalog.categories.map((item) => item.categoryId),
        isTimed: catalog.isTimed,
        totalTimeSeconds: catalog.totalTimeSeconds,
        passThresholdPercent: catalog.passThresholdPercent,
        finalExamCatalogId: catalog.id,
        attemptNumber: usedAttempts + 1,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An attempt for this final exam was created concurrently. Retry the request.',
        );
      }
      throw error;
    }
  }

  private async getCatalogById(id: string) {
    const catalog = await this.prisma.finalExamCatalog.findUnique({
      where: { id },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        competitions: {
          include: {
            competition: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!catalog) throw new NotFoundException('Final exam catalog not found');

    return {
      id: catalog.id,
      title: catalog.title,
      status: catalog.status,
      questionCount: catalog.questionCount,
      isTimed: catalog.isTimed,
      totalTimeSeconds: catalog.totalTimeSeconds,
      maxRetries: catalog.maxRetries,
      maxAttempts: this.toMaxAttempts(catalog.maxRetries),
      shuffleOptions: catalog.shuffleOptions,
      passThresholdPercent: catalog.passThresholdPercent,
      publishedAt: catalog.publishedAt,
      createdAt: catalog.createdAt,
      categories: catalog.categories.map((item) => item.category),
      competitions: catalog.competitions.map((item) => item.competition),
    };
  }

  private validateTimerFields(dto: {
    isTimed: boolean;
    totalTimeSeconds?: number;
  }) {
    if (dto.isTimed && !dto.totalTimeSeconds) {
      throw new BadRequestException(
        'totalTimeSeconds is required when isTimed is true',
      );
    }
  }

  private normalizeUniqueTextValues(values: string[]) {
    const normalized = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return Array.from(new Set(normalized));
  }

  private toMaxAttempts(maxRetries: number) {
    return Math.max(1, maxRetries);
  }

  private toTenScale(scorePercent?: number | null) {
    if (scorePercent == null) return null;
    return Number((scorePercent / 10).toFixed(2));
  }
}
