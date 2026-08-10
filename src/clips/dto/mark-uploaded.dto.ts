import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class MarkUploadedDto {
  /**
   * El browser avisa si ademas del video subio la miniatura. Va como DTO y no
   * como campo suelto porque el `ValidationPipe` corre con `whitelist: true` y
   * descarta en silencio cualquier propiedad no declarada.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasThumbnail?: boolean;
}
