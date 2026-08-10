import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateClipCollectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Reemplaza la lista completa. Omitirlo deja los grupos como estaban; mandar
   * `[]` quita la restricción y la colección vuelve a verse para todos.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupIds?: string[];
}
