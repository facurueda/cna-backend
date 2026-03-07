import { IsEmail, IsIn, IsNotEmpty } from "class-validator";
import { Role } from "@prisma/client";

export class UpdateRoleDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsIn([Role.ADMIN, Role.GENERAL])
  @IsNotEmpty()
  role: Role;
}
