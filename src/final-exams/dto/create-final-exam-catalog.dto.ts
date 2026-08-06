import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FinalExamCatalogKind, Language } from '@prisma/client';

export class FinalExamCatalogPairDto {
  @IsUUID('4')
  userAId!: string;

  @IsUUID('4')
  userBId!: string;
}

export class FinalExamCatalogPhraseInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  answer!: string;
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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  questionCount?: number;

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
  @IsEnum(FinalExamCatalogKind)
  kind?: FinalExamCatalogKind;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalExamCatalogPairDto)
  pairs?: FinalExamCatalogPairDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FinalExamCatalogPhraseInputDto)
  phrases?: FinalExamCatalogPhraseInputDto[];
}
