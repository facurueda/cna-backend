import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type BulkCorrectAnswerInput = {
  code: string;
  keys: string[];
};

@Injectable()
export class CorrectAnswersService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkCreate(payload: unknown) {
    const items = this.validatePayload(payload);

    const inserted = await this.prisma.$transaction(async (tx) => {
      const codes = Array.from(new Set(items.map((item) => item.code)));

      const questions = await tx.question.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true },
      });

      const questionByCode = new Map<string, string>();
      const duplicateCodes = new Set<string>();

      for (const question of questions) {
        if (questionByCode.has(question.code)) {
          duplicateCodes.add(question.code);
          continue;
        }
        questionByCode.set(question.code, question.id);
      }

      if (duplicateCodes.size > 0) {
        throw new BadRequestException(
          `Duplicate question codes found in DB: ${Array.from(duplicateCodes).join(', ')}`,
        );
      }

      const missingCodes = codes.filter((code) => !questionByCode.has(code));
      if (missingCodes.length > 0) {
        throw new BadRequestException(
          `Question code not found: ${missingCodes.join(', ')}`,
        );
      }

      const affectedQuestionIds = Array.from(
        new Set(items.map((item) => questionByCode.get(item.code) as string)),
      );

      await tx.questionCorrectAnswerKey.deleteMany({
        where: { questionId: { in: affectedQuestionIds } },
      });

      const data = items.flatMap((item) => {
        const questionId = questionByCode.get(item.code) as string;
        return item.keys.map((key) => ({ questionId, key }));
      });

      const created = await tx.questionCorrectAnswerKey.createMany({
        data,
        skipDuplicates: true,
      });

      return created.count;
    });

    return { inserted };
  }

  private validatePayload(payload: unknown): BulkCorrectAnswerInput[] {
    const list = this.extractItemsArray(payload);

    if (list.length === 0) {
      throw new BadRequestException('Body array must contain at least one item');
    }

    return list.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`Item at index ${index} must be an object`);
      }

      const raw = item as Record<string, unknown>;
      const code = this.readRequiredString(raw.code, `code at index ${index}`);

      if (!Array.isArray(raw.keys) || raw.keys.length === 0) {
        throw new BadRequestException(
          `keys at index ${index} must be a non-empty array`,
        );
      }

      const keys: string[] = [];
      const seen = new Set<string>();

      raw.keys.forEach((value, keyIndex) => {
        const key = this.readRequiredString(value, `keys[${keyIndex}] at index ${index}`);
        if (!seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      });

      return { code, keys };
    });
  }

  private extractItemsArray(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;

    if (payload && typeof payload === 'object') {
      const wrapped = payload as Record<string, unknown>;
      if (Array.isArray(wrapped.correctAnswers)) return wrapped.correctAnswers;
    }

    throw new BadRequestException(
      'Body must be an array or an object with correctAnswers[]',
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
}
