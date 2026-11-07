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
  FinalExamCatalogKind,
  FinalExamCatalogStatus,
  Language,
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

const DEFAULT_LANGUAGE: Language = Language.ES;

@Injectable()
export class FinalExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly examsService: ExamsService,
  ) {}

  async createCatalog(user: AuthUserPayload, dto: CreateFinalExamCatalogDto) {
    this.validateTimerFields(dto);
    const kind = dto.kind ?? FinalExamCatalogKind.CATALOG;
    const isSearch = kind === FinalExamCatalogKind.SEARCH;
    const hasFixedQuestions =
      !isSearch && dto.questionIds != null && dto.questionIds.length > 0;

    let phrases: { text: string; answer: string }[] = [];
    if (isSearch) {
      phrases = (dto.phrases ?? []).map((phrase) => ({
        text: phrase.text.trim(),
        answer: phrase.answer.trim(),
      }));
      if (phrases.length === 0) {
        throw new BadRequestException(
          'At least one phrase is required for SEARCH catalogs',
        );
      }
    } else if (
      !hasFixedQuestions &&
      (!dto.categoryIds || dto.categoryIds.length === 0)
    ) {
      throw new BadRequestException(
        'Either categoryIds or questionIds must be provided',
      );
    }

    const language = isSearch
      ? DEFAULT_LANGUAGE
      : (dto.language ?? DEFAULT_LANGUAGE);

    const questionCount = isSearch
      ? phrases.length
      : this.resolveCatalogQuestionCount(dto.questionCount);

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

    const pairs = dto.pairs ?? [];
    if (pairs.length > 0) {
      await this.validatePairs(pairs, groupIds);
    }

    let categoryIds: string[] = [];
    let questionIds: string[] = [];
    if (!isSearch && !hasFixedQuestions) {
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

      const availableQuestionCount = await this.prisma.question.count({
        where: {
          categoryId: { in: categoryIds },
          translations: { some: { language } },
        },
      });
      if (availableQuestionCount < questionCount) {
        throw new BadRequestException(
          `Not enough ${language} questions for selected categories. Requested ${questionCount}, available ${availableQuestionCount}`,
        );
      }
    } else if (!isSearch && hasFixedQuestions) {
      questionIds = this.normalizeUniqueTextValues(dto.questionIds!);
      if (questionIds.length !== questionCount) {
        throw new BadRequestException(
          `questionIds length (${questionIds.length}) must equal questionCount (${questionCount})`,
        );
      }
      const questions = await this.prisma.question.findMany({
        where: { id: { in: questionIds } },
        select: {
          id: true,
          code: true,
          translations: { where: { language }, select: { id: true } },
        },
      });
      if (questions.length !== questionIds.length) {
        const existing = new Set(questions.map((q) => q.id));
        const missing = questionIds.filter((id) => !existing.has(id));
        throw new NotFoundException(
          `Question not found: ${missing.join(', ')}`,
        );
      }
      const missingTranslation = questions.filter(
        (q) => q.translations.length === 0,
      );
      if (missingTranslation.length > 0) {
        throw new BadRequestException(
          `Question(s) without a ${language} translation: ${missingTranslation
            .map((q) => q.code)
            .join(', ')}`,
        );
      }
    }

    const created = await this.prisma.finalExamCatalog.create({
      data: {
        title: dto.title?.trim() || 'Examen',
        questionCount,
        isTimed: dto.isTimed,
        totalTimeSeconds: dto.isTimed ? (dto.totalTimeSeconds ?? null) : null,
        availableUntilDate,
        maxRetries: dto.maxRetries ?? 0,
        shuffleOptions: dto.shuffleOptions ?? true,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        passThresholdPercent: 80,
        language,
        kind,
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
        ...(pairs.length > 0
          ? {
              pairs: {
                createMany: {
                  data: pairs.map((pair) => ({
                    userAId: pair.userAId,
                    userBId: pair.userBId,
                  })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
        ...(phrases.length > 0
          ? {
              phrases: {
                create: phrases.map((phrase, index) => ({
                  position: index + 1,
                  regulationPhrase: {
                    create: { text: phrase.text, answer: phrase.answer },
                  },
                })),
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
        pairs: {
          select: { userAId: true, userBId: true },
        },
        phrases: {
          orderBy: { position: 'asc' },
          include: {
            regulationPhrase: {
              select: { id: true, text: true, answer: true },
            },
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
      availableUntilDate: created.availableUntilDate,
      isClosed: isFinalExamCatalogClosed(created.availableUntilDate),
      maxRetries: created.maxRetries,
      maxAttempts: this.toMaxAttempts(created.maxRetries),
      shuffleOptions: created.shuffleOptions,
      shuffleQuestions: created.shuffleQuestions,
      passThresholdPercent: created.passThresholdPercent,
      language: created.language,
      kind: created.kind,
      publishedAt: created.publishedAt,
      createdAt: created.createdAt,
      categories: created.categories.map((item) => item.category),
      groups: created.groups.map((item) => item.group),
      fixedQuestions: created.fixedQuestions.map((item) => item.questionId),
      pairs: created.pairs.map((item) => ({
        userAId: item.userAId,
        userBId: item.userBId,
      })),
      phrases: created.phrases.map((item) => ({
        id: item.regulationPhrase.id,
        text: item.regulationPhrase.text,
        answer: item.regulationPhrase.answer,
      })),
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

  async deleteCatalog(id: string) {
    const catalog = await this.prisma.finalExamCatalog.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!catalog) throw new NotFoundException('Final exam catalog not found');

    // Las tablas puente (categories, groups, fixedQuestions, pairs, phrases)
    // tienen onDelete: Cascade, así que se borran solas.
    // Los intentos ya rendidos (Exam) NO se borran: la relación es
    // onDelete: SetNull, por lo que quedan en la DB desvinculados del catálogo.
    await this.prisma.finalExamCatalog.delete({ where: { id } });

    return { id };
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
        shuffleQuestions: catalog.shuffleQuestions,
        passThresholdPercent: catalog.passThresholdPercent,
        language: catalog.language,
        kind: catalog.kind,
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
        shuffleQuestions: catalog.shuffleQuestions,
        passThresholdPercent: catalog.passThresholdPercent,
        language: catalog.language,
        kind: catalog.kind,
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
        kind: true,
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
        questionCount: true,
        createdAt: true,
        finishedAt: true,
      },
    });

    // Progreso de los examenes abiertos: cuantas preguntas respondio cada uno.
    const openExamIds = exams
      .filter((exam) => exam.status === ExamStatus.PENDING)
      .map((exam) => exam.id);
    const openQuestions = openExamIds.length
      ? await this.prisma.examQuestion.findMany({
          where: { examId: { in: openExamIds } },
          select: {
            examId: true,
            categoryName: true,
            submittedText: true,
            responses: { select: { key: true } },
            correctKeys: { select: { key: true } },
          },
        })
      : [];
    const openQuestionsByExamId = new Map<string, typeof openQuestions>();
    for (const question of openQuestions) {
      const current = openQuestionsByExamId.get(question.examId) ?? [];
      current.push(question);
      openQuestionsByExamId.set(question.examId, current);
    }

    // Progreso de los examenes ya enviados (el ultimo de cada arbitro): cuantas
    // preguntas llego a responder. Consulta liviana: no hace falta la correccion.
    const lastFinishedByUserId = new Map<string, (typeof exams)[number]>();
    for (const exam of exams) {
      if (
        exam.status === ExamStatus.FINISHED &&
        !lastFinishedByUserId.has(exam.userId)
      ) {
        lastFinishedByUserId.set(exam.userId, exam);
      }
    }
    const finishedExamIds = Array.from(lastFinishedByUserId.values()).map(
      (exam) => exam.id,
    );
    const finishedQuestions = finishedExamIds.length
      ? await this.prisma.examQuestion.findMany({
          where: { examId: { in: finishedExamIds } },
          select: {
            examId: true,
            submittedText: true,
            responses: { select: { id: true }, take: 1 },
          },
        })
      : [];
    const answeredByFinishedExamId = new Map<string, number>();
    for (const question of finishedQuestions) {
      if (question.responses.length > 0 || question.submittedText) {
        answeredByFinishedExamId.set(
          question.examId,
          (answeredByFinishedExamId.get(question.examId) ?? 0) + 1,
        );
      }
    }

    const liveStatsOf = (examId: string) => {
      const questions = openQuestionsByExamId.get(examId) ?? [];
      return {
        answered: questions.filter(
          (q) => q.responses.length > 0 || Boolean(q.submittedText),
        ).length,
        scorePercent: this.examsService.partialScorePercent(
          catalog.kind,
          questions,
        ),
      };
    };

    let users: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    }[];

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

      // Progreso: preguntas respondidas / total del examen que corresponde (el
      // abierto, si lo esta resolviendo; si no, el ultimo enviado).
      const live = pendingAttempt ? liveStatsOf(pendingAttempt.id) : null;
      const progress =
        pendingAttempt && live
          ? { answered: live.answered, total: pendingAttempt.questionCount }
          : lastFinished
            ? {
                answered: answeredByFinishedExamId.get(lastFinished.id) ?? 0,
                total: lastFinished.questionCount,
              }
            : { answered: 0, total: catalog.questionCount };

      return {
        user,
        progress,
        // NOT_STARTED: sin intentos; IN_PROGRESS: tiene un examen abierto ahora
        // (aunque ya haya terminado uno anterior); FINISHED: todo lo iniciado
        // fue enviado.
        attemptState: pendingAttempt
          ? ('IN_PROGRESS' as const)
          : userExams.length > 0
            ? ('FINISHED' as const)
            : ('NOT_STARTED' as const),
        liveExam: pendingAttempt
          ? {
              examId: pendingAttempt.id,
              ...live,
              total: pendingAttempt.questionCount,
              startedAt: pendingAttempt.createdAt,
            }
          : null,
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
        // Intento unico: una vez enviado el examen el resultado es definitivo
        // (aprobado o desaprobado), sin importar los reintentos que queden.
        status: hasPassed
          ? 'APPROVED'
          : lastFinished || isClosed
            ? 'FAILED'
            : 'PENDING',
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
    // Pendiente = todavia no empezo; el que lo esta resolviendo va en `inProgress`.
    const pendingCount = referees.filter(
      (referee) =>
        referee.status === 'PENDING' && referee.attemptState === 'NOT_STARTED',
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
        inProgress: referees.filter(
          (referee) => referee.attemptState === 'IN_PROGRESS',
        ).length,
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
        pairs: {
          select: { userAId: true, userBId: true },
        },
        phrases: {
          orderBy: { position: 'asc' },
          select: {
            regulationPhrase: { select: { text: true, answer: true } },
          },
        },
      },
    });

    if (!catalog) throw new NotFoundException('Final exam catalog not found');
    const isSearch = catalog.kind === FinalExamCatalogKind.SEARCH;
    const hasFixedQuestions = !isSearch && catalog.fixedQuestions.length > 0;
    if (!isSearch && !hasFixedQuestions && !catalog.categories.length) {
      throw new BadRequestException('Final exam catalog has no categories');
    }
    if (isSearch && catalog.phrases.length === 0) {
      throw new BadRequestException('Final exam catalog has no phrases');
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

    const pair = catalog.pairs.find(
      (item) => item.userAId === user.id || item.userBId === user.id,
    );
    const isFirstAttempt =
      pair &&
      (await this.prisma.exam.count({
        where: { userId: user.id, finalExamCatalogId: catalog.id },
      })) === 0;
    if (pair && isFirstAttempt) {
      const partnerId = pair.userAId === user.id ? pair.userBId : pair.userAId;
      const partnerPendingAttempt = await this.prisma.exam.findFirst({
        where: {
          userId: partnerId,
          finalExamCatalogId: catalog.id,
          status: ExamStatus.PENDING,
        },
        select: { id: true },
      });

      if (partnerPendingAttempt) {
        const partner = await this.prisma.user.findUnique({
          where: { id: partnerId },
          select: { firstName: true, lastName: true },
        });
        const partnerName = partner
          ? `${partner.firstName} ${partner.lastName}`
          : 'tu pareja';
        throw new ConflictException(
          `Tu pareja, ${partnerName}, ya está rindiendo este examen.`,
        );
      }
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
        shuffleQuestions: catalog.shuffleQuestions ?? false,
        finalExamCatalogId: catalog.id,
        attemptNumber: usedAttempts + 1,
        language: catalog.language,
        catalogKind: catalog.kind,
        phrases: isSearch
          ? catalog.phrases.map((item) => ({
              text: item.regulationPhrase.text,
              answer: item.regulationPhrase.answer,
            }))
          : undefined,
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
      shuffleQuestions: catalog.shuffleQuestions,
      passThresholdPercent: catalog.passThresholdPercent,
      language: catalog.language,
      kind: catalog.kind,
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

  private resolveCatalogQuestionCount(value?: number): number {
    if (value == null || ![10, 15, 20, 30].includes(value)) {
      throw new BadRequestException(
        'questionCount must be one of: 10, 15, 20, 30',
      );
    }
    return value;
  }

  private async validatePairs(
    pairs: { userAId: string; userBId: string }[],
    groupIds: string[],
  ) {
    const userIds: string[] = [];
    for (const pair of pairs) {
      if (pair.userAId === pair.userBId) {
        throw new BadRequestException(
          `A pair cannot have the same user on both sides: ${pair.userAId}`,
        );
      }
      userIds.push(pair.userAId, pair.userBId);
    }

    const duplicated = userIds.filter(
      (id, index) => userIds.indexOf(id) !== index,
    );
    if (duplicated.length > 0) {
      throw new BadRequestException(
        `User(s) cannot be part of more than one pair: ${Array.from(new Set(duplicated)).join(', ')}`,
      );
    }

    const uniqueUserIds = Array.from(new Set(userIds));
    const memberships = await this.prisma.userGroup.findMany({
      where: { userId: { in: uniqueUserIds }, groupId: { in: groupIds } },
      select: { userId: true },
    });
    const memberIds = new Set(memberships.map((m) => m.userId));
    const notInGroups = uniqueUserIds.filter((id) => !memberIds.has(id));
    if (notInGroups.length > 0) {
      throw new BadRequestException(
        `User(s) in pairs are not members of the selected groups: ${notInGroups.join(', ')}`,
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
