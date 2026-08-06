import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateRegulationPhraseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  answer?: string;
}
