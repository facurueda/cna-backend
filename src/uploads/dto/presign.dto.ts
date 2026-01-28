import { IsIn, IsOptional, IsString } from "class-validator";

export class PresignDto {
  @IsString()
  fileName!: string; // ej: "clip_001.mp4"

  @IsOptional()
  @IsString()
  contentType?: string; // ej: "video/mp4"

  @IsOptional()
  @IsIn(["clip"])
  type?: "clip";
}