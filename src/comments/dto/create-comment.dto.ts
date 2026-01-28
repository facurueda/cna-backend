import { IsString, IsUUID } from "class-validator";

export class CreateCommentDto {
  @IsUUID()
  clipId!: string;

  @IsString()
  content!: string;
}