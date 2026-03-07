import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class UpdateClipDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

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
  @ArrayUnique()
  @IsUUID('4', { each: true })
  refereeIds?: string[];
}
