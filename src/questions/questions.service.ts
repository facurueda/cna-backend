import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type BulkAnswerInput = {
  key: string;
  text: string;
};

type BulkQuestionInput = {
  code: string;
  text: string;
  categoryName?: string;
  answers: BulkAnswerInput[];
};

const TEMP_INSERT_ORDER = 139;

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listQuestions() {
    return this.prisma.question.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        text: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        category: {
          select: { id: true, name: true },
        },
        answers: {
          orderBy: [{ key: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            key: true,
            text: true,
          },
        },
        correctAnswerKeys: {
          orderBy: [{ key: 'asc' }, { id: 'asc' }],
          select: { key: true },
        },
      },
    });
  }

  async listCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async bulkCreate(payload: unknown) {
    const questions = this.validateBulkPayload(payload);

    const inserted = await this.prisma.$transaction(async (tx) => {
      const maxOrder = await tx.question.aggregate({
        _max: { order: true },
      });
      const nextOrder = (maxOrder._max.order ?? 0) + 1;

      return this.insertQuestionsAtOrder(tx, questions, nextOrder);
    });

    return { inserted };
  }

  async bulkInsertAtOrder139(payload: unknown) {
    const questions = this.validateBulkPayload(payload);

    const inserted = await this.prisma.$transaction(async (tx) => {
      await tx.question.updateMany({
        where: { order: { gte: TEMP_INSERT_ORDER } },
        data: { order: { increment: questions.length } },
      });

      return this.insertQuestionsAtOrder(tx, questions, TEMP_INSERT_ORDER);
    });

    return { inserted };
  }

  private async insertQuestionsAtOrder(
    tx: Prisma.TransactionClient,
    questions: BulkQuestionInput[],
    startOrder: number,
  ): Promise<number> {
    const categoryCache = new Map<string, string>();

    for (let index = 0; index < questions.length; index += 1) {
      const questionInput = questions[index];
      const categoryId = await this.resolveCategoryId(
        tx,
        questionInput.categoryName,
        categoryCache,
      );

      await tx.question.create({
        data: {
          code: questionInput.code,
          text: questionInput.text,
          categoryId,
          order: startOrder + index,
          answers: {
            create: questionInput.answers.map((answer) => ({
              key: answer.key,
              text: answer.text,
            })),
          },
        },
      });
    }

    return questions.length;
  }

  private async resolveCategoryId(
    tx: Prisma.TransactionClient,
    categoryName: string | undefined,
    cache: Map<string, string>,
  ): Promise<string | undefined> {
    if (!categoryName) return undefined;
    if (cache.has(categoryName)) return cache.get(categoryName);

    const existingCategory = await tx.category.findFirst({
      where: { name: categoryName },
      select: { id: true },
    });

    if (existingCategory) {
      cache.set(categoryName, existingCategory.id);
      return existingCategory.id;
    }

    const createdCategory = await tx.category.create({
      data: { name: categoryName },
      select: { id: true },
    });
    cache.set(categoryName, createdCategory.id);
    return createdCategory.id;
  }

  private validateBulkPayload(payload: unknown): BulkQuestionInput[] {
    const list = this.extractQuestionsArray(payload);

    if (list.length === 0) {
      throw new BadRequestException('Body array must contain at least one question');
    }

    return list.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`Question at index ${index} must be an object`);
      }

      const raw = item as Record<string, unknown>;
      const code = this.readRequiredString(raw.code, `code at index ${index}`);
      const text = this.readRequiredString(raw.text, `text at index ${index}`);
      const categoryName = this.readOptionalString(
        raw.categoryName,
        `categoryName at index ${index}`,
      );

      if (!Array.isArray(raw.answers) || raw.answers.length === 0) {
        throw new BadRequestException(
          `answers at index ${index} must be a non-empty array`,
        );
      }

      const answers = raw.answers.map((answer, answerIndex) => {
        if (!answer || typeof answer !== 'object') {
          throw new BadRequestException(
            `answer at index ${index}.${answerIndex} must be an object`,
          );
        }

        const rawAnswer = answer as Record<string, unknown>;
        return {
          key: this.readRequiredString(
            rawAnswer.key,
            `answers[${answerIndex}].key at index ${index}`,
          ),
          text: this.readRequiredString(
            rawAnswer.text,
            `answers[${answerIndex}].text at index ${index}`,
          ),
        };
      });

      return {
        code,
        text,
        categoryName,
        answers,
      };
    });
  }

  private extractQuestionsArray(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;

    if (payload && typeof payload === 'object') {
      const wrapped = payload as Record<string, unknown>;
      if (Array.isArray(wrapped.questions)) return wrapped.questions;
    }

    throw new BadRequestException(
      'Body must be an array of questions or an object with questions[]',
    );
  }

  private readRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }

    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return trimmed;
  }

  private readOptionalString(value: unknown, fieldName: string): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string`);
    }

    const trimmed = value.trim();
    return trimmed || undefined;
  }
}
