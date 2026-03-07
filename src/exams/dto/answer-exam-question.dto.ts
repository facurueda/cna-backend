import { ArrayUnique, IsArray, IsString, IsUUID } from 'class-validator';

export class AnswerExamQuestionDto {
  @IsUUID('4')
  examQuestionId!: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  selectedKeys!: string[];
}
