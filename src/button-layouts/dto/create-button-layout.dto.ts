import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ButtonLayoutTileDto, trimString } from './button-layout-tile.dto';

export class CreateButtonLayoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  @Transform(trimString)
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ButtonLayoutTileDto)
  tiles!: ButtonLayoutTileDto[];
}
