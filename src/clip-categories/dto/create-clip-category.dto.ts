import { IsNotEmpty, IsString } from 'class-validator';

export class CreateClipCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
