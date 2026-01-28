import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class BatchClipItemDto {
  @IsString()
  title!: string;

  @IsString()
  videoUrl!: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
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