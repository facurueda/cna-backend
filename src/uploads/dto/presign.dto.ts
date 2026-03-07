import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class PresignDto {
  @IsString()
  @IsNotEmpty()
  competitionId!: string;

  @IsString()
  @IsNotEmpty()
  matchId!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string; // ej: "clip_001.mp4"

  @IsString()
  @IsNotEmpty()
  contentType!: string; // ej: "video/mp4"

  @IsOptional()
  @IsIn(['video', 'image'])
  assetType?: 'video' | 'image';

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  size!: number; // bytes
}
