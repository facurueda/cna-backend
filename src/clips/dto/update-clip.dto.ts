import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateClipDto {
  /**
   * `null` saca el clip de su coleccion. `@IsOptional()` ignora los validadores
   * cuando el valor es `null` o `undefined`, asi que ambos pasan: `undefined` no
   * toca el campo y `null` lo limpia.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  collectionId?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;
}
