import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim();
};

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  eventName?: string;
}
