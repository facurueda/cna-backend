import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClipCollectionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Grupos que pueden ver la colección. Vacío u omitido = todos los árbitros. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];
}
