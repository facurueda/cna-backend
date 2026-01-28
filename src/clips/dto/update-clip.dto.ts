import { IsArray, IsOptional, IsString, IsUUID, ArrayUnique } from "class-validator";

export class UpdateClipDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  refereeIds?: string[];
}