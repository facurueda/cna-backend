import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRegulationPhraseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  answer!: string;
}
