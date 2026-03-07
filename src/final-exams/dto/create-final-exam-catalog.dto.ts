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
  Max,
  Min,
} from 'class-validator';

export class CreateFinalExamCatalogDto {
  @IsOptional()
  @IsString()
  title?: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([10, 15, 20, 30])
  questionCount!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  categoryIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  competitionIds!: string[];

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
