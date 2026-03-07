import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { Transform } from "class-transformer";

const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

export class CreateMatchDto {
  @IsString()
  competitionId: string;

  @IsString()
  @IsNotEmpty()
  teamA: string;

  @IsString()
  @IsNotEmpty()
  teamB: string;

  @IsOptional()
  @IsString()
  @Transform(trimToUndefined)
  category?: string;

  @IsOptional()
  @IsDateString()
  @Transform(trimToUndefined)
  date?: string; // ISO string

  // arbitros asignados al partido (userIds)
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  refereeIds?: string[];
}
