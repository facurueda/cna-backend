import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim();
};

class CreateEventItemDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  category!: string;

  @IsDateString()
  createdAt!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  endTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  endTimeMs!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  eventTimeMs!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  incrementId!: number;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  startTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  startTimeMs!: number;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  tileId!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  title!: string;
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  eventName!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventItemDto)
  events!: CreateEventItemDto[];
}
