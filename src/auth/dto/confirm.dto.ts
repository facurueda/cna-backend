import { IsEmail, IsString } from "class-validator";

export class ConfirmDto {
  @IsEmail()
  email: string;

  @IsString()
  code: string;
}
