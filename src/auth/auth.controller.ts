import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Roles } from './roles/roles.decorator';
import { RolesGuard } from './roles/roles.guard';
import { AuthUser } from './decorators/auth-user.decorator';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { AppLoginDto } from './dto/app-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAppCredentialDto } from './dto/create-app-credential.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthenticatedUser } from './auth-user.types';

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

  @Post('app-login')
  appLogin(@Body() dto: AppLoginDto) {
    return this.auth.appLogin(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('verify-reset-code')
  verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.auth.verifyResetCode(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('app-credentials')
  createAppCredential(
    @AuthUser() user: AuthenticatedUser,
    @Body() dto: CreateAppCredentialDto,
  ) {
    return this.auth.createAppCredential(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('app-credentials')
  listAppCredentials(@AuthUser() user: AuthenticatedUser) {
    return this.auth.listAppCredentials(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('app-credentials/:id')
  revokeAppCredential(
    @AuthUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.auth.revokeAppCredential(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(
    @AuthUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('role')
  setRole(@Body() dto: UpdateRoleDto) {
    return this.auth.setUserRole(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@AuthUser() user: AuthenticatedUser) {
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
