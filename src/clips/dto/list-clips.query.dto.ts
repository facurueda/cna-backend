import { Type } from 'class-transformer';
import { ClipVisibility } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListClipsQueryDto {
  @IsOptional()
  @IsString()
  collectionId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ClipVisibility)
  visibility?: ClipVisibility;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
