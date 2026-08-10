import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateClipDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  /** Opcional: un clip puede vivir suelto en la galeria, sin coleccion. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  collectionId?: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size?: number;

  /** Duracion en segundos, calculada en el browser al leer el archivo. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;
}
