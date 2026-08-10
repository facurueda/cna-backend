import { IsNotEmpty, IsString } from 'class-validator';

export class SwitchProjectDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;
}
