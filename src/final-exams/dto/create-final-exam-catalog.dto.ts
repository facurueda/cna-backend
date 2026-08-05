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
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Language } from '@prisma/client';

export class FinalExamCatalogPairDto {
  @IsUUID('4')
  userAId!: string;

  @IsUUID('4')
  userBId!: string;
}

export class CreateFinalExamCatalogDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'availableUntilDate must use YYYY-MM-DD format',
  })
  availableUntilDate?: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([10, 15, 20, 30])
  questionCount!: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  questionIds?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  groupIds!: string[];

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @IsBoolean()
  isTimed!: boolean;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  totalTimeSeconds?: number;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamCatalogPairDto)
  pairs?: FinalExamCatalogPairDto[];
}
