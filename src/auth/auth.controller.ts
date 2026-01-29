import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CognitoAuthGuard } from './guards/cognito-auth.guard';
import { Roles } from './roles/roles.decorator';
import { RolesGuard } from './roles/roles.guard';
import { AuthUser } from './decorators/auth-user.decorator';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ConfirmDto } from './dto/confirm.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('confirm')
  confirm(@Body() dto: ConfirmDto) {
    return this.auth.confirm(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(CognitoAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('role')
  setRole(@Body() dto: UpdateRoleDto) {
    return this.auth.setUserRole(dto);
  }

  @UseGuards(CognitoAuthGuard)
  @Get('me')
  me(@AuthUser() user) {
    return user;
  }

  // Ejemplo de endpoint solo admin (para probar)
  @UseGuards(CognitoAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }
}
