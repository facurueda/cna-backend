import { IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, ArrayUnique } from "class-validator";

export class CreateMatchDto {
  @IsUUID()
  competitionId: string;

  @IsString()
  @IsNotEmpty()
  teamA: string;

  @IsString()
  @IsNotEmpty()
  teamB: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsDateString()
  date: string; // ISO string

  // arbitros asignados al partido (userIds)
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  refereeIds?: string[];
}