import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateClipCollectionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
