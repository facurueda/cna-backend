import { IsIn, IsOptional } from 'class-validator';

export const FINISH_EXAM_REASONS = ['MANUAL', 'TIMEOUT'] as const;

export type FinishExamReason = (typeof FINISH_EXAM_REASONS)[number];

export class FinishExamDto {
  /**
   * Why the exam is being finished.
   * - MANUAL (default): the user pressed "Finalizar". Every question must be answered.
   * - TIMEOUT: the timer ran out. The exam is closed no matter what; questions with
   *   no stored answer simply score 0 points (they neither add nor subtract).
   */
  @IsOptional()
  @IsIn(FINISH_EXAM_REASONS)
  reason?: FinishExamReason;
}
