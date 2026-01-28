import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateCompetitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  seasonLabel?: string;
}