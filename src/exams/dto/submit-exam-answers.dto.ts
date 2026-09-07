import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { AnswerExamQuestionDto } from './answer-exam-question.dto';

export class SubmitExamAnswersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AnswerExamQuestionDto)
  answers!: AnswerExamQuestionDto[];
}
