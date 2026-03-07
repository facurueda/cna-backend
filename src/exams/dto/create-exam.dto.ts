import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { ExamType } from '@prisma/client';

export class CreateExamDto {
  @Type(() => Number)
  @IsInt()
  @IsIn([5, 10, 15, 20])
  questionCount!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds!: string[];

  @IsBoolean()
  isTimed!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalTimeSeconds?: number;

  @IsEnum(ExamType)
  examType!: ExamType;
}
