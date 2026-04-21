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
import {
  isFinalExamCatalogClosed,
  isValidFinalExamAvailableUntilDate,
} from './final-exam-availability';

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
    const hasFixedQuestions =
      dto.questionIds != null && dto.questionIds.length > 0;

    if (!hasFixedQuestions && (!dto.categoryIds || dto.categoryIds.length === 0)) {
      throw new BadRequestException(
        'Either categoryIds or questionIds must be provided',
      );
    }

    const availableUntilDate = this.normalizeAvailableUntilDate(
      dto.availableUntilDate,
    );

    const groupIds = this.normalizeUniqueTextValues(dto.groupIds);

    const groups = await this.prisma.group.findMany({
      where: { id: { in: groupIds } },
      select: { id: true, name: true },
    });

    if (groups.length !== groupIds.length) {
      const existing = new Set(groups.map((group) => group.id));
      const missing = groupIds.filter((id) => !existing.has(id));
      throw new NotFoundException(
        `Group not found for final exam catalog: ${missing.join(', ')}`,
      );
    }

    let categoryIds: string[] = [];
    if (!hasFixedQuestions) {
      categoryIds = this.normalizeUniqueTextValues(dto.categoryIds!);
      const categories = await this.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      });
      if (categories.length !== categoryIds.length) {
        const existing = new Set(categories.map((c) => c.id));
        const missing = categoryIds.filter((id) => !existing.has(id));
        throw new NotFoundException(
          `Category not found for final exam catalog: ${missing.join(', ')}`,
        );
      }
    }

    let questionIds: string[] = [];
    if (hasFixedQuestions) {
      questionIds = this.normalizeUniqueTextValues(dto.questionIds!);
      if (questionIds.length !== dto.questionCount) {
        throw new BadRequestException(
          `questionIds length (${questionIds.length}) must equal questionCount (${dto.questionCount})`,
        );
      }
      const questions = await this.prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: { id: true },
      });
      if (questions.length !== questionIds.length) {
        const existing = new Set(questions.map((q) => q.id));
        const missing = questionIds.filter((id) => !existing.has(id));
        throw new NotFoundException(
          `Question not found: ${missing.join(', ')}`,
        );
      }
    }

    const created = await this.prisma.finalExamCatalog.create({
      data: {
        title: dto.title?.trim() || 'Examen',
        questionCount: dto.questionCount,
        isTimed: dto.isTimed,
        totalTimeSeconds: dto.isTimed ? (dto.totalTimeSeconds ?? null) : null,
        availableUntilDate,
        maxRetries: dto.maxRetries ?? 0,
        shuffleOptions: dto.shuffleOptions ?? true,
        passThresholdPercent: dto.passThresholdPercent ?? 70,
        status: FinalExamCatalogStatus.DRAFT,
        publishedAt: null,
        createdById: user.id,
        ...(categoryIds.length > 0
          ? {
              categories: {
                createMany: {
                  data: categoryIds.map((categoryId) => ({ categoryId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
        groups: {
          createMany: {
            data: groupIds.map((groupId) => ({ groupId })),
            skipDuplicates: true,
          },
        },
        ...(questionIds.length > 0
          ? {
              fixedQuestions: {
                createMany: {
                  data: questionIds.map((questionId, index) => ({
                    questionId,
                    position: index + 1,
                  })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        groups: {
          include: {
            group: { select: { id: true, name: true } },
          },
        },
        fixedQuestions: {
          orderBy: { position: 'asc' },
          select: { questionId: true, position: true },
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
      availableUntilDate: created.availableUntilDate,
      isClosed: isFinalExamCatalogClosed(created.availableUntilDate),
      maxRetries: created.maxRetries,
      maxAttempts: this.toMaxAttempts(created.maxRetries),
      shuffleOptions: created.shuffleOptions,
      passThresholdPercent: created.passThresholdPercent,
      publishedAt: created.publishedAt,
      createdAt: created.createdAt,
      categories: created.categories.map((item) => item.category),
      groups: created.groups.map((item) => item.group),
      fixedQuestions: created.fixedQuestions.map((item) => item.questionId),
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

  async listAllCatalogs() {
    const catalogs = await this.prisma.finalExamCatalog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        categories: {
          include: { category: { select: { id: true, name: true } } },
        },
        groups: {
          include: { group: { select: { id: true, name: true } } },
        },
        exams: {
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
        },
      },
    });

    return catalogs.map((catalog) => {
      const maxAttempts = this.toMaxAttempts(catalog.maxRetries);
      const isClosed = isFinalExamCatalogClosed(catalog.availableUntilDate);
      const finishedExams = catalog.exams.filter(
        (e) => e.status === ExamStatus.FINISHED,
      );
      const resolvedCount = new Set(finishedExams.map((e) => e.userId)).size;
      const totalReferees = new Set(catalog.exams.map((e) => e.userId)).size;
      const scores = finishedExams
        .filter((e) => e.scorePercent != null)
        .map((e) => e.scorePercent as number);
      const averageScoreOnTen =
        scores.length > 0
          ? Number(
              (scores.reduce((s, v) => s + v, 0) / scores.length / 10).toFixed(
                2,
              ),
            )
          : null;

      return {
        id: catalog.id,
        title: catalog.title,
        status: catalog.status,
        questionCount: catalog.questionCount,
        isTimed: catalog.isTimed,
        totalTimeSeconds: catalog.totalTimeSeconds,
        availableUntilDate: catalog.availableUntilDate,
        isClosed,
        maxRetries: catalog.maxRetries,
        maxAttempts,
        shuffleOptions: catalog.shuffleOptions,
        passThresholdPercent: catalog.passThresholdPercent,
        publishedAt: catalog.publishedAt,
        createdAt: catalog.createdAt,
        categories: catalog.categories.map((item) => item.category),
        groups: catalog.groups.map((item) => item.group),
        summary: {
          resolutions: { resolved: resolvedCount, total: totalReferees },
          averageScoreOnTen,
        },
      };
    });
  }

  async listMyCatalogs(user: AuthUserPayload) {
    const catalogs = await this.prisma.finalExamCatalog.findMany({
      where: {
        status: FinalExamCatalogStatus.PUBLISHED,
        groups: {
          some: {
            group: {
              members: {
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
        groups: {
          include: { group: { select: { id: true, name: true } } },
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
      const isClosed = isFinalExamCatalogClosed(catalog.availableUntilDate);
      const hasPendingAttempt = catalog.exams.some(
        (exam) => exam.status === ExamStatus.PENDING,
      );
      const pendingAttemptId =
        catalog.exams.find((exam) => exam.status === ExamStatus.PENDING)?.id ??
        null;
      const hasPassed = catalog.exams.some((exam) => exam.isPassed === true);
      const remainingAttempts =
        hasPassed || isClosed ? 0 : Math.max(0, maxAttempts - usedAttempts);
      const lastFinished =
        catalog.exams.find((exam) => exam.status === ExamStatus.FINISHED) ??
        null;

      return {
        id: catalog.id,
        title: catalog.title,
        status: catalog.status,
        questionCount: catalog.questionCount,
        isTimed: catalog.isTimed,
        totalTimeSeconds: catalog.totalTimeSeconds,
        availableUntilDate: catalog.availableUntilDate,
        isClosed,
        maxRetries: catalog.maxRetries,
        maxAttempts,
        shuffleOptions: catalog.shuffleOptions,
        passThresholdPercent: catalog.passThresholdPercent,
        publishedAt: catalog.publishedAt,
        createdAt: catalog.createdAt,
        categories: catalog.categories.map((item) => item.category),
        groups: catalog.groups.map((item) => item.group),
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
        availableUntilDate: true,
        maxRetries: true,
        createdAt: true,
        groups: {
          select: {
            groupId: true,
            group: {
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

    const groups = Array.from(
      new Map(
        catalog.groups.map((item) => [
          item.group.id,
          { id: item.group.id, name: item.group.name },
        ]),
      ).values(),
    );
    const groupIds = Array.from(
      new Set(catalog.groups.map((item) => item.groupId)),
    );
    const maxAttempts = this.toMaxAttempts(catalog.maxRetries);

    const exams = await this.prisma.exam.findMany({
      where: { finalExamCatalogId: catalog.id },
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
    });

    let users: { id: string; firstName: string; lastName: string; email: string }[];

    if (groupIds.length) {
      const links = await this.prisma.userGroup.findMany({
        where: { groupId: { in: groupIds } },
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
      users = Array.from(userById.values());
    } else {
      // No groups: derive users from who actually took the exam
      const examUserIds = Array.from(new Set(exams.map((e) => e.userId)));
      const rawUsers = examUserIds.length
        ? await this.prisma.user.findMany({
            where: { id: { in: examUserIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          })
        : [];
      users = rawUsers;
    }

    users.sort((a, b) => {
      const byLastName = a.lastName.localeCompare(b.lastName);
      if (byLastName !== 0) return byLastName;
      return a.firstName.localeCompare(b.firstName);
    });

    const examsByUser = new Map<string, typeof exams>();
    for (const exam of exams) {
      const current = examsByUser.get(exam.userId) ?? [];
      current.push(exam);
      examsByUser.set(exam.userId, current);
    }

    const referees = users.map((user) => {
      const userExams = examsByUser.get(user.id) ?? [];
      const usedAttempts = userExams.length;
      const isClosed = isFinalExamCatalogClosed(catalog.availableUntilDate);
      const pendingAttempt =
        userExams.find((exam) => exam.status === ExamStatus.PENDING) ?? null;
      const hasPassed = userExams.some((exam) => exam.isPassed === true);
      const lastFinished =
        userExams.find((exam) => exam.status === ExamStatus.FINISHED) ?? null;
      const remainingAttempts =
        hasPassed || isClosed ? 0 : Math.max(0, maxAttempts - usedAttempts);

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
          : isClosed
            ? 'FAILED'
            : pendingAttempt || usedAttempts < maxAttempts
              ? 'PENDING'
              : 'FAILED',
      };
    });

    const completedRefereeUserIds = new Set(
      exams
        .filter((exam) => exam.status === ExamStatus.FINISHED)
        .map((exam) => exam.userId),
    );
    const completedReferees = referees.filter((referee) =>
      completedRefereeUserIds.has(referee.user.id),
    );
    const approvedCount = referees.filter(
      (referee) => referee.status === 'APPROVED',
    ).length;
    const pendingCount = referees.filter(
      (referee) => referee.status === 'PENDING',
    ).length;
    const averageScoreOnTen =
      completedReferees.length > 0
        ? Number(
            (
              completedReferees.reduce(
                (sum, referee) => sum + (referee.result.scoreOnTen ?? 0),
                0,
              ) / completedReferees.length
            ).toFixed(2),
          )
        : null;

    return {
      id: catalog.id,
      title: catalog.title,
      status: catalog.status,
      createdAt: catalog.createdAt,
      questionCount: catalog.questionCount,
      availableUntilDate: catalog.availableUntilDate,
      isClosed: isFinalExamCatalogClosed(catalog.availableUntilDate),
      maxRetries: catalog.maxRetries,
      maxAttempts,
      groups,
      summary: {
        resolutions: {
          resolved: completedReferees.length,
          total: referees.length,
        },
        averageScoreOnTen,
        approved: {
          count: approvedCount,
          totalResolved: completedReferees.length,
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
        groups: {
          select: { groupId: true },
        },
        fixedQuestions: {
          orderBy: { position: 'asc' },
          select: { questionId: true },
        },
      },
    });

    if (!catalog) throw new NotFoundException('Final exam catalog not found');
    const hasFixedQuestions = catalog.fixedQuestions.length > 0;
    if (!hasFixedQuestions && !catalog.categories.length) {
      throw new BadRequestException('Final exam catalog has no categories');
    }

    if (catalog.status !== FinalExamCatalogStatus.PUBLISHED) {
      throw new ForbiddenException('Final exam catalog is not published');
    }

    const groupIds = catalog.groups.map((item) => item.groupId);
    const assignment = await this.prisma.userGroup.findFirst({
      where: {
        userId: user.id,
        groupId: { in: groupIds },
      },
      select: { groupId: true },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'You do not have access to this final exam catalog',
      );
    }

    this.ensureCatalogIsOpen(catalog.availableUntilDate);

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
        fixedQuestionIds: hasFixedQuestions
          ? catalog.fixedQuestions.map((item) => item.questionId)
          : undefined,
        isTimed: catalog.isTimed,
        totalTimeSeconds: catalog.totalTimeSeconds,
        shuffleOptions: catalog.shuffleOptions ?? true,
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
        groups: {
          include: {
            group: { select: { id: true, name: true } },
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
      availableUntilDate: catalog.availableUntilDate,
      isClosed: isFinalExamCatalogClosed(catalog.availableUntilDate),
      maxRetries: catalog.maxRetries,
      maxAttempts: this.toMaxAttempts(catalog.maxRetries),
      shuffleOptions: catalog.shuffleOptions,
      passThresholdPercent: catalog.passThresholdPercent,
      publishedAt: catalog.publishedAt,
      createdAt: catalog.createdAt,
      categories: catalog.categories.map((item) => item.category),
      groups: catalog.groups.map((item) => item.group),
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

  private normalizeAvailableUntilDate(value?: string | null) {
    if (value == null) return null;

    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException('availableUntilDate cannot be empty');
    }
    if (!isValidFinalExamAvailableUntilDate(normalized)) {
      throw new BadRequestException(
        'availableUntilDate must be a valid calendar date in YYYY-MM-DD format',
      );
    }

    return normalized;
  }

  private ensureCatalogIsOpen(availableUntilDate?: string | null) {
    if (isFinalExamCatalogClosed(availableUntilDate)) {
      throw new ConflictException('Final exam catalog is closed');
    }
  }

  private toMaxAttempts(maxRetries: number) {
    return Math.max(1, maxRetries);
  }

  private toTenScale(scorePercent?: number | null) {
    if (scorePercent == null) return null;
    return Number((scorePercent / 10).toFixed(2));
  }
}
