import { IsEmail, IsIn } from "class-validator";

export class UpdateRoleDto {
  @IsEmail()
  email: string;

  @IsIn(["ADMIN", "USER", "MEMBER"])
  role: "ADMIN" | "USER" | "MEMBER";
}
