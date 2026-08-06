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
  Language,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { AnswerExamQuestionDto } from './dto/answer-exam-question.dto';
import { UserStatsService } from '../users/user-stats.service';
import { isFinalExamCatalogClosed } from '../final-exams/final-exam-availability';

type AuthUserPayload = {
  id: string;
  role: Role;
};

type CreateGeneratedExamInput = {
  examType: ExamType;
  questionCount: number;
  categoryIds: string[];
  fixedQuestionIds?: string[];
  isTimed: boolean;
  totalTimeSeconds?: number | null;
  finalExamCatalogId?: string;
  attemptNumber?: number;
  shuffleOptions?: boolean;
  language: Language;
  catalogKind?: FinalExamCatalogKind;
  phrases?: { text: string; answer: string }[];
};

const DEFAULT_PASS_THRESHOLD = 80;
const DEFAULT_LANGUAGE: Language = Language.ES;
const DEFAULT_CATALOG_KIND: FinalExamCatalogKind = FinalExamCatalogKind.CATALOG;

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStatsService: UserStatsService,
  ) {}

  async create(user: AuthUserPayload, dto: CreateExamDto) {
    if (dto.examType === ExamType.FINAL) {
      throw new BadRequestException(
        'Final exams must be started from the final exam catalog',
      );
    }

    return this.createGeneratedExam(user, {
      examType: dto.examType,
      questionCount: dto.questionCount,
      categoryIds: dto.categoryIds,
      isTimed: dto.isTimed,
      totalTimeSeconds: dto.totalTimeSeconds ?? null,
      language: dto.language ?? DEFAULT_LANGUAGE,
    });
  }

  async createGeneratedExam(
    user: AuthUserPayload,
    input: CreateGeneratedExamInput,
  ) {
    this.validateTimerFields(input);
    if (input.examType !== ExamType.FINAL && input.finalExamCatalogId) {
      throw new BadRequestException(
        'finalExamCatalogId is only valid for FINAL exams',
      );
    }

    const catalogKind = input.catalogKind ?? DEFAULT_CATALOG_KIND;

    const examQuestions =
      catalogKind === FinalExamCatalogKind.SEARCH
        ? this.buildSearchExamQuestions(input)
        : await this.buildCatalogExamQuestions(input);

    const created = await this.prisma.exam.create({
      data: {
        userId: user.id,
        finalExamCatalogId: input.finalExamCatalogId,
        attemptNumber: input.attemptNumber,
        questionCount: input.questionCount,
        isTimed: input.isTimed,
        totalTimeSeconds: input.isTimed
          ? (input.totalTimeSeconds ?? null)
          : null,
        examType: input.examType,
        status: ExamStatus.PENDING,
        passThresholdPercent: DEFAULT_PASS_THRESHOLD,
        language: input.language,
        catalogKind,
        correctCount: null,
        wrongCount: null,
        scorePercent: null,
        isPassed: null,
        ...(examQuestions.length > 0
          ? {
              questions: {
                create: examQuestions,
              },
            }
          : {}),
      },
      select: { id: true },
    });

    return this.findOne(created.id, user);
  }

  private buildSearchExamQuestions(input: CreateGeneratedExamInput) {
    const phrases = input.phrases ?? [];
    if (phrases.length === 0) {
      throw new BadRequestException(
        'Final exam catalog has no phrases configured',
      );
    }

    return phrases.map((phrase, index) => ({
      position: index + 1,
      questionCode: `phrase-${index + 1}`,
      questionText: phrase.text,
      categoryName: phrase.answer,
    }));
  }

  private async buildCatalogExamQuestions(input: CreateGeneratedExamInput) {
    let selectedQuestions: {
      id?: string;
      code: string;
      text: string;
      category: { name: string } | null;
      answers: { key: string; text: string }[];
      correctAnswerKeys: { key: string }[];
    }[];

    if (input.fixedQuestionIds && input.fixedQuestionIds.length > 0) {
      const fixedIds = this.normalizeUniqueKeys(input.fixedQuestionIds);
      const rows = await this.prisma.question.findMany({
        where: { id: { in: fixedIds } },
        select: {
          id: true,
          code: true,
          category: { select: { name: true } },
          translations: {
            where: { language: input.language },
            select: {
              text: true,
              answers: {
                orderBy: [{ key: 'asc' }, { id: 'asc' }],
                select: { key: true, text: true },
              },
            },
          },
          correctAnswerKeys: {
            orderBy: [{ key: 'asc' }, { id: 'asc' }],
            select: { key: true },
          },
        },
      });

      const missingTranslation = rows.filter(
        (q) => q.translations.length === 0,
      );
      if (missingTranslation.length > 0) {
        throw new BadRequestException(
          `Question(s) without a ${input.language} translation: ${missingTranslation
            .map((q) => q.code)
            .join(', ')}`,
        );
      }

      const byId = new Map(
        rows.map((q) => [
          q.id,
          {
            id: q.id,
            code: q.code,
            text: q.translations[0].text,
            category: q.category,
            answers: q.translations[0].answers,
            correctAnswerKeys: q.correctAnswerKeys,
          },
        ]),
      );
      selectedQuestions = fixedIds
        .map((id) => byId.get(id))
        .filter((q): q is NonNullable<typeof q> => q != null);
    } else {
      const categoryIds = this.normalizeUniqueKeys(input.categoryIds);
      const categories = await this.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true },
      });

      if (categories.length !== categoryIds.length) {
        const existing = new Set(categories.map((category) => category.id));
        const missing = categoryIds.filter((id) => !existing.has(id));
        throw new NotFoundException(
          `Category not found: ${missing.join(', ')}`,
        );
      }

      const rows = await this.prisma.question.findMany({
        where: {
          categoryId: { in: categoryIds },
          translations: { some: { language: input.language } },
        },
        select: {
          code: true,
          category: { select: { name: true } },
          translations: {
            where: { language: input.language },
            select: {
              text: true,
              answers: {
                orderBy: [{ key: 'asc' }, { id: 'asc' }],
                select: { key: true, text: true },
              },
            },
          },
          correctAnswerKeys: {
            orderBy: [{ key: 'asc' }, { id: 'asc' }],
            select: { key: true },
          },
        },
      });

      const pool = rows.map((q) => ({
        code: q.code,
        text: q.translations[0].text,
        category: q.category,
        answers: q.translations[0].answers,
        correctAnswerKeys: q.correctAnswerKeys,
      }));

      if (pool.length < input.questionCount) {
        throw new BadRequestException(
          `Not enough questions for selected categories. Requested ${input.questionCount}, available ${pool.length}`,
        );
      }

      selectedQuestions = this.pickRandomQuestions(pool, input.questionCount);
    }

    const examQuestions = selectedQuestions.map((question, index) => {
      const orderedAnswers = input.shuffleOptions
        ? this.shuffleArray(question.answers)
        : question.answers;

      return {
        position: index + 1,
        questionCode: question.code,
        questionText: question.text,
        categoryName: question.category?.name,
        options: {
          create: orderedAnswers.map((answer, optionIndex) => ({
            position: optionIndex + 1,
            key: answer.key,
            text: answer.text,
          })),
        },
        correctKeys: {
          create: this.normalizeUniqueKeys(
            question.correctAnswerKeys.map((item) => item.key),
          ).map((key) => ({ key })),
        },
      };
    });

    return examQuestions;
  }

  async findMyExams(user: AuthUserPayload) {
    return this.findExamsByUserId(user.id);
  }

  async findUserExams(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.findExamsByUserId(userId);
  }

  async findOne(id: string, user: AuthUserPayload) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        finalExamCatalog: {
          select: { availableUntilDate: true },
        },
        questions: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: {
            options: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: { id: true, key: true, text: true },
            },
            responses: {
              orderBy: [{ key: 'asc' }, { id: 'asc' }],
              select: { key: true },
            },
          },
        },
      },
    });

    if (!exam) throw new NotFoundException('Exam not found');
    this.ensureExamAccess(exam.userId, user);
    this.ensurePendingFinalExamIsOpen(
      exam.examType,
      exam.status,
      exam.finalExamCatalog?.availableUntilDate,
    );

    return {
      id: exam.id,
      userId: exam.userId,
      finalExamCatalogId: exam.finalExamCatalogId,
      attemptNumber: exam.attemptNumber,
      questionCount: exam.questionCount,
      isTimed: exam.isTimed,
      totalTimeSeconds: exam.totalTimeSeconds,
      status: exam.status,
      examType: exam.examType,
      passThresholdPercent: exam.passThresholdPercent,
      language: exam.language,
      catalogKind: exam.catalogKind,
      correctCount: exam.correctCount,
      wrongCount: exam.wrongCount,
      scorePercent: exam.scorePercent,
      isPassed: exam.isPassed,
      createdAt: exam.createdAt,
      finishedAt: exam.finishedAt,
      questions: exam.questions.map((question) => ({
        id: question.id,
        position: question.position,
        code: question.questionCode,
        text: question.questionText,
        categoryName: question.categoryName,
        options: question.options,
        selectedKeys: question.responses.map((response) => response.key),
        submittedText: question.submittedText,
      })),
    };
  }

  async findReview(id: string, user: AuthUserPayload) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: {
            options: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: { key: true, text: true },
            },
            correctKeys: {
              orderBy: [{ key: 'asc' }, { id: 'asc' }],
              select: { key: true },
            },
            responses: {
              orderBy: [{ key: 'asc' }, { id: 'asc' }],
              select: { key: true },
            },
          },
        },
      },
    });

    if (!exam) throw new NotFoundException('Exam not found');
    this.ensureExamAccess(exam.userId, user);

    if (exam.status !== ExamStatus.FINISHED) {
      throw new ConflictException('Exam is not finished');
    }

    const computedResult = this.calculateExamResults(
      exam.questions,
      exam.passThresholdPercent,
    );

    const correctCount = exam.correctCount ?? computedResult.correctCount;
    const wrongCount = exam.wrongCount ?? computedResult.wrongCount;
    const scorePercent = exam.scorePercent ?? computedResult.scorePercent;
    const isPassed = exam.isPassed ?? computedResult.isPassed;

    return {
      id: exam.id,
      status: exam.status,
      questionCount: exam.questionCount,
      correctCount,
      wrongCount,
      scorePercent,
      isPassed,
      catalogKind: exam.catalogKind,
      examQuestions: exam.questions.map((question) => {
        const correctKeySet = new Set(
          this.normalizeUniqueKeys(
            question.correctKeys.map((item) => item.key),
          ),
        );

        return {
          id: question.id,
          order: question.position,
          prompt: question.questionText,
          categoryName: question.categoryName,
          submittedText: question.submittedText,
          isCorrect:
            exam.catalogKind === FinalExamCatalogKind.SEARCH
              ? this.normalizePhraseAnswer(question.submittedText) !== null &&
                this.normalizePhraseAnswer(question.submittedText) ===
                  this.normalizePhraseAnswer(question.categoryName)
              : undefined,
          options: question.options.map((option) => ({
            key: option.key,
            text: option.text,
            isCorrect: correctKeySet.has(option.key),
          })),
        };
      }),
      answers: exam.questions.map((question) => ({
        examQuestionId: question.id,
        selectedKeys: this.normalizeUniqueKeys(
          question.responses.map((response) => response.key),
        ),
      })),
    };
  }

  async answer(id: string, user: AuthUserPayload, dto: AnswerExamQuestionDto) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        examType: true,
        catalogKind: true,
        finalExamCatalog: {
          select: { availableUntilDate: true },
        },
      },
    });

    if (!exam) throw new NotFoundException('Exam not found');
    this.ensureExamAccess(exam.userId, user);
    this.ensurePendingFinalExamIsOpen(
      exam.examType,
      exam.status,
      exam.finalExamCatalog?.availableUntilDate,
    );

    if (exam.status !== ExamStatus.PENDING) {
      throw new BadRequestException('Exam is already finished');
    }

    if (exam.catalogKind === FinalExamCatalogKind.SEARCH) {
      const searchQuestion = await this.prisma.examQuestion.findFirst({
        where: { id: dto.examQuestionId, examId: exam.id },
        select: { id: true },
      });

      if (!searchQuestion) {
        throw new NotFoundException('Exam question not found for this exam');
      }

      await this.prisma.examQuestion.update({
        where: { id: searchQuestion.id },
        data: { submittedText: dto.freeText?.trim() || null },
      });

      return { ok: true };
    }

    const question = await this.prisma.examQuestion.findFirst({
      where: { id: dto.examQuestionId, examId: exam.id },
      select: {
        id: true,
        options: { select: { key: true } },
      },
    });

    if (!question) {
      throw new NotFoundException('Exam question not found for this exam');
    }

    const selectedKeys = this.normalizeUniqueKeys(dto.selectedKeys ?? []);
    const allowedKeys = new Set(question.options.map((option) => option.key));

    for (const key of selectedKeys) {
      if (!allowedKeys.has(key)) {
        throw new BadRequestException(
          `Invalid selected key "${key}" for this question`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examQuestionResponse.deleteMany({
        where: { examQuestionId: question.id },
      });

      if (selectedKeys.length > 0) {
        await tx.examQuestionResponse.createMany({
          data: selectedKeys.map((key) => ({
            examQuestionId: question.id,
            key,
          })),
          skipDuplicates: true,
        });
      }
    });

    return { ok: true };
  }

  async finish(id: string, user: AuthUserPayload) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        finalExamCatalog: {
          select: { availableUntilDate: true },
        },
        questions: {
          include: {
            options: {
              orderBy: [{ position: 'asc' }, { id: 'asc' }],
              select: { position: true, key: true, text: true },
            },
            correctKeys: { select: { key: true } },
            responses: { select: { key: true } },
          },
        },
      },
    });

    if (!exam) throw new NotFoundException('Exam not found');
    this.ensureExamAccess(exam.userId, user);
    this.ensurePendingFinalExamIsOpen(
      exam.examType,
      exam.status,
      exam.finalExamCatalog?.availableUntilDate,
    );

    if (exam.status !== ExamStatus.PENDING) {
      throw new BadRequestException('Exam is already finished');
    }

    if (!exam.questions.length) {
      throw new BadRequestException('Exam has no questions');
    }

    const { correctCount, wrongCount, scorePercent, isPassed } =
      exam.catalogKind === FinalExamCatalogKind.SEARCH
        ? this.calculatePhraseExamResults(
            exam.questions,
            exam.passThresholdPercent,
          )
        : this.calculateExamResults(exam.questions, exam.passThresholdPercent);

    const updated = await this.prisma.$transaction(async (tx) => {
      const finishedExam = await tx.exam.update({
        where: { id: exam.id },
        data: {
          status: ExamStatus.FINISHED,
          correctCount,
          wrongCount,
          scorePercent,
          isPassed,
          finishedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          questionCount: true,
          correctCount: true,
          wrongCount: true,
          scorePercent: true,
          isPassed: true,
          finishedAt: true,
        },
      });

      await this.userStatsService.registerFinishedExam(
        {
          userId: exam.userId,
          examType: exam.examType,
          scorePercent,
          isPassed,
        },
        tx,
      );

      if (exam.finalExamCatalogId && exam.attemptNumber === 1) {
        const pair = await tx.finalExamCatalogPair.findFirst({
          where: {
            finalExamCatalogId: exam.finalExamCatalogId,
            OR: [{ userAId: exam.userId }, { userBId: exam.userId }],
          },
          select: { userAId: true, userBId: true },
        });

        if (pair) {
          const partnerId =
            pair.userAId === exam.userId ? pair.userBId : pair.userAId;
          const partnerAlreadyHasExam = await tx.exam.count({
            where: {
              userId: partnerId,
              finalExamCatalogId: exam.finalExamCatalogId,
            },
          });

          if (partnerAlreadyHasExam === 0) {
            await tx.exam.create({
              data: {
                userId: partnerId,
                finalExamCatalogId: exam.finalExamCatalogId,
                attemptNumber: 1,
                questionCount: exam.questionCount,
                isTimed: exam.isTimed,
                totalTimeSeconds: exam.totalTimeSeconds,
                examType: exam.examType,
                passThresholdPercent: exam.passThresholdPercent,
                language: exam.language,
                status: ExamStatus.FINISHED,
                correctCount,
                wrongCount,
                scorePercent,
                isPassed,
                finishedAt: finishedExam.finishedAt,
                questions: {
                  create: exam.questions.map((question) => ({
                    position: question.position,
                    questionCode: question.questionCode,
                    questionText: question.questionText,
                    categoryName: question.categoryName,
                    options: {
                      create: question.options.map((option) => ({
                        position: option.position,
                        key: option.key,
                        text: option.text,
                      })),
                    },
                    correctKeys: {
                      create: question.correctKeys.map((item) => ({
                        key: item.key,
                      })),
                    },
                    responses: {
                      create: question.responses.map((item) => ({
                        key: item.key,
                      })),
                    },
                  })),
                },
              },
            });

            await this.userStatsService.registerFinishedExam(
              {
                userId: partnerId,
                examType: exam.examType,
                scorePercent,
                isPassed,
              },
              tx,
            );
          }
        }
      }

      return finishedExam;
    });

    return updated;
  }

  private calculateExamResults(
    questions: {
      correctKeys: { key: string }[];
      responses: { key: string }[];
    }[],
    passThresholdPercent: number,
  ) {
    let earnedPoints = 0;
    let totalPossiblePoints = 0;

    for (const question of questions) {
      const correct = this.normalizeUniqueKeys(
        question.correctKeys.map((key) => key.key),
      );
      const selected = this.normalizeUniqueKeys(
        question.responses.map((response) => response.key),
      );

      const questionMaxPoints = correct.length;
      totalPossiblePoints += questionMaxPoints;

      const correctSet = new Set(correct);
      let selectedCorrectCount = 0;
      let selectedIncorrectCount = 0;

      for (const key of selected) {
        if (correctSet.has(key)) {
          selectedCorrectCount += 1;
        } else {
          selectedIncorrectCount += 1;
        }
      }

      const questionPoints = Math.max(
        0,
        Math.min(
          questionMaxPoints,
          selectedCorrectCount - selectedIncorrectCount,
        ),
      );
      earnedPoints += questionPoints;
    }

    const wrongCount = Math.max(0, totalPossiblePoints - earnedPoints);
    const scorePercent =
      totalPossiblePoints > 0
        ? Number(((earnedPoints / totalPossiblePoints) * 100).toFixed(2))
        : 0;
    const isPassed = scorePercent >= passThresholdPercent;

    return {
      correctCount: earnedPoints,
      wrongCount,
      scorePercent,
      isPassed,
    };
  }

  private calculatePhraseExamResults(
    questions: {
      categoryName: string | null;
      submittedText: string | null;
    }[],
    passThresholdPercent: number,
  ) {
    let correctCount = 0;

    for (const question of questions) {
      const expected = this.normalizePhraseAnswer(question.categoryName);
      const submitted = this.normalizePhraseAnswer(question.submittedText);
      if (expected !== null && expected === submitted) {
        correctCount += 1;
      }
    }

    const totalQuestions = questions.length;
    const wrongCount = Math.max(0, totalQuestions - correctCount);
    const scorePercent =
      totalQuestions > 0
        ? Number(((correctCount / totalQuestions) * 100).toFixed(2))
        : 0;
    const isPassed = scorePercent >= passThresholdPercent;

    return {
      correctCount,
      wrongCount,
      scorePercent,
      isPassed,
    };
  }

  private normalizePhraseAnswer(value: string | null | undefined): string | null {
    if (!value) return null;
    const cleaned = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleaned.length > 0 ? cleaned : null;
  }

  private validateTimerFields(dto: {
    isTimed: boolean;
    totalTimeSeconds?: number | null;
  }) {
    if (dto.isTimed && !dto.totalTimeSeconds) {
      throw new BadRequestException(
        'totalTimeSeconds is required when isTimed is true',
      );
    }
  }

  private ensureExamAccess(examUserId: string, user: AuthUserPayload) {
    if (user.role === Role.ADMIN) return;
    if (examUserId !== user.id) {
      throw new ForbiddenException('You do not have access to this exam');
    }
  }

  private ensurePendingFinalExamIsOpen(
    examType: ExamType,
    status: ExamStatus,
    availableUntilDate?: string | null,
  ) {
    if (examType !== ExamType.FINAL || status !== ExamStatus.PENDING) return;
    if (isFinalExamCatalogClosed(availableUntilDate)) {
      throw new ConflictException('Final exam is closed');
    }
  }

  private findExamsByUserId(userId: string) {
    return this.prisma.exam
      .findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          userId: true,
          finalExamCatalogId: true,
          attemptNumber: true,
          questionCount: true,
          isTimed: true,
          totalTimeSeconds: true,
          status: true,
          examType: true,
          passThresholdPercent: true,
          language: true,
          correctCount: true,
          wrongCount: true,
          scorePercent: true,
          isPassed: true,
          createdAt: true,
          finishedAt: true,
          finalExamCatalog: {
            select: {
              title: true,
            },
          },
        },
      })
      .then((exams) =>
        exams.map((exam) => ({
          id: exam.id,
          userId: exam.userId,
          finalExamCatalogId: exam.finalExamCatalogId,
          attemptNumber: exam.attemptNumber,
          questionCount: exam.questionCount,
          isTimed: exam.isTimed,
          totalTimeSeconds: exam.totalTimeSeconds,
          status: exam.status,
          examType: exam.examType,
          passThresholdPercent: exam.passThresholdPercent,
          language: exam.language,
          correctCount: exam.correctCount,
          wrongCount: exam.wrongCount,
          scorePercent: exam.scorePercent,
          isPassed: exam.isPassed,
          createdAt: exam.createdAt,
          finishedAt: exam.finishedAt,
          title: exam.finalExamCatalog?.title ?? null,
        })),
      );
  }

  private pickRandomQuestions<
    T extends {
      code: string;
      text: string;
      category: { name: string } | null;
      answers: { key: string; text: string }[];
      correctAnswerKeys: { key: string }[];
    },
  >(questions: T[], count: number): T[] {
    const shuffled = this.shuffleArray(questions);
    return shuffled.slice(0, count);
  }

  private shuffleArray<T>(values: T[]): T[] {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  private normalizeUniqueKeys(values: string[]): string[] {
    const normalized = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return Array.from(new Set(normalized));
  }
}
