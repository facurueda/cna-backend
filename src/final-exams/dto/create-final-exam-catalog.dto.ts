import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

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

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passThresholdPercent?: number;
}
