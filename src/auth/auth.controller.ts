import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './roles/roles.decorator';
import { RolesGuard } from './roles/roles.guard';
import { AuthUser } from './decorators/auth-user.decorator';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('role')
  setRole(@Body() dto: UpdateRoleDto) {
    return this.auth.setUserRole(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@AuthUser() user) {
    return user;
  }

  // Ejemplo de endpoint solo admin (para probar)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }
}
