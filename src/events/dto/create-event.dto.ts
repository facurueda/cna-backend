import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreateEventItemDto } from './create-event-item.dto';

const trimString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim();
};

export class CreateEventDto {
  @ValidateIf((dto: CreateEventDto) => !dto.name)
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  eventName?: string;

  @ValidateIf((dto: CreateEventDto) => !dto.eventName)
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEventItemDto)
  events!: CreateEventItemDto[];
}
