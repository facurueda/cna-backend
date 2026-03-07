import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExamStatus, ExamType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { AnswerExamQuestionDto } from './dto/answer-exam-question.dto';
import { UserStatsService } from '../users/user-stats.service';

type AuthUserPayload = {
  id: string;
  role: Role;
};

type CreateGeneratedExamInput = {
  examType: ExamType;
  questionCount: number;
  categoryIds: string[];
  isTimed: boolean;
  totalTimeSeconds?: number | null;
  passThresholdPercent?: number;
  finalExamCatalogId?: string;
  attemptNumber?: number;
};

const DEFAULT_PASS_THRESHOLD = 70;

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

    const categoryIds = this.normalizeUniqueKeys(input.categoryIds);
    const categories = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });

    if (categories.length !== categoryIds.length) {
      const existing = new Set(categories.map((category) => category.id));
      const missing = categoryIds.filter((id) => !existing.has(id));
      throw new NotFoundException(`Category not found: ${missing.join(', ')}`);
    }

    const pool = await this.prisma.question.findMany({
      where: { categoryId: { in: categoryIds } },
      select: {
        code: true,
        text: true,
        category: { select: { name: true } },
        answers: {
          orderBy: [{ key: 'asc' }, { id: 'asc' }],
          select: { key: true, text: true },
        },
        correctAnswerKeys: {
          orderBy: [{ key: 'asc' }, { id: 'asc' }],
          select: { key: true },
        },
      },
    });

    if (pool.length < input.questionCount) {
      throw new BadRequestException(
        `Not enough questions for selected categories. Requested ${input.questionCount}, available ${pool.length}`,
      );
    }

    const selectedQuestions = this.pickRandomQuestions(pool, input.questionCount);

    const examId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          userId: user.id,
          finalExamCatalogId: input.finalExamCatalogId,
          attemptNumber: input.attemptNumber,
          questionCount: input.questionCount,
          isTimed: input.isTimed,
          totalTimeSeconds: input.isTimed ? input.totalTimeSeconds ?? null : null,
          examType: input.examType,
          status: ExamStatus.PENDING,
          passThresholdPercent:
            input.passThresholdPercent ?? DEFAULT_PASS_THRESHOLD,
          correctCount: null,
          wrongCount: null,
          scorePercent: null,
          isPassed: null,
        },
        select: { id: true },
      });

      for (let index = 0; index < selectedQuestions.length; index += 1) {
        const question = selectedQuestions[index];
        await tx.examQuestion.create({
          data: {
            examId: created.id,
            position: index + 1,
            questionCode: question.code,
            questionText: question.text,
            categoryName: question.category?.name,
            options: {
              create: question.answers.map((answer) => ({
                key: answer.key,
                text: answer.text,
              })),
            },
            correctKeys: {
              create: this.normalizeUniqueKeys(
                question.correctAnswerKeys.map((item) => item.key),
              ).map((key) => ({ key })),
            },
          },
        });
      }

      return created.id;
    });

    return this.findOne(examId, user);
  }

  async findMyExams(user: AuthUserPayload) {
    return this.prisma.exam.findMany({
      where: { userId: user.id },
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
        correctCount: true,
        wrongCount: true,
        scorePercent: true,
        isPassed: true,
        createdAt: true,
        finishedAt: true,
      },
    });
  }

  async findOne(id: string, user: AuthUserPayload) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: [{ position: 'asc' }, { id: 'asc' }],
          include: {
            options: {
              orderBy: [{ key: 'asc' }, { id: 'asc' }],
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
              orderBy: [{ key: 'asc' }, { id: 'asc' }],
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
      examQuestions: exam.questions.map((question) => {
        const correctKeySet = new Set(
          this.normalizeUniqueKeys(question.correctKeys.map((item) => item.key)),
        );

        return {
          id: question.id,
          order: question.position,
          prompt: question.questionText,
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
      select: { id: true, userId: true, status: true },
    });

    if (!exam) throw new NotFoundException('Exam not found');
    this.ensureExamAccess(exam.userId, user);

    if (exam.status !== ExamStatus.PENDING) {
      throw new BadRequestException('Exam is already finished');
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

    const selectedKeys = this.normalizeUniqueKeys(dto.selectedKeys);
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
        questions: {
          include: {
            correctKeys: { select: { key: true } },
            responses: { select: { key: true } },
          },
        },
      },
    });

    if (!exam) throw new NotFoundException('Exam not found');
    this.ensureExamAccess(exam.userId, user);

    if (exam.status !== ExamStatus.PENDING) {
      throw new BadRequestException('Exam is already finished');
    }

    if (!exam.questions.length) {
      throw new BadRequestException('Exam has no questions');
    }

    const { correctCount, wrongCount, scorePercent, isPassed } =
      this.calculateExamResults(exam.questions, exam.passThresholdPercent);

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
        Math.min(questionMaxPoints, selectedCorrectCount - selectedIncorrectCount),
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

  private pickRandomQuestions<
    T extends {
      code: string;
      text: string;
      category: { name: string } | null;
      answers: { key: string; text: string }[];
      correctAnswerKeys: { key: string }[];
    },
  >(questions: T[], count: number): T[] {
    const shuffled = [...questions];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    return shuffled.slice(0, count);
  }

  private normalizeUniqueKeys(values: string[]): string[] {
    const normalized = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return Array.from(new Set(normalized));
  }
}
