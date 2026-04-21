import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
