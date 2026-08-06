import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AnswerExamQuestionDto {
  @IsUUID('4')
  examQuestionId!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  selectedKeys?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  freeText?: string;
}
