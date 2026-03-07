import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayUnique,
} from 'class-validator';

class BatchClipItemDto {
  @IsString()
  title!: string;

  @IsString()
  videoUrl!: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  refereeIds?: string[];
}

export class CreateClipBatchDto {
  @IsUUID()
  matchId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchClipItemDto)
  clips!: BatchClipItemDto[];
}
