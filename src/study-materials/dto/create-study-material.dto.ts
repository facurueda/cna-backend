import { IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateStudyMaterialDto {
  @IsUrl()
  url!: string;

  @IsString()
  @MaxLength(255)
  documentName!: string;
}
