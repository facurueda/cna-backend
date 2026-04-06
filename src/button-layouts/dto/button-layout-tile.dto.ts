import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const trimString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim();
};

export class ButtonLayoutTileDto {
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(trimString)
  label!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  colSpan!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  rowSpan!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Transform(trimString)
  tone!: string;
}
