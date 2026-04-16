import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateClipCollectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
