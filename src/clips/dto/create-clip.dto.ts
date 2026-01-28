import { IsArray, IsOptional, IsString, IsUUID, ArrayUnique } from "class-validator";

export class CreateClipDto {
  @IsUUID()
  matchId!: string;

  @IsString()
  title!: string;

  @IsString()
  videoUrl!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  refereeIds?: string[];
}