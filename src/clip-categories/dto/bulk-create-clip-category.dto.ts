import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { CreateClipCategoryDto } from './create-clip-category.dto';

export class BulkCreateClipCategoryDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateClipCategoryDto)
  categories!: CreateClipCategoryDto[];
}
