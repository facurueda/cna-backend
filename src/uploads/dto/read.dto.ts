import { IsNotEmpty, IsString } from "class-validator";

export class ReadDto {
  @IsString()
  @IsNotEmpty()
  key!: string;
}
