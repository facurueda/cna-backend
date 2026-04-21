import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateClipCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}
