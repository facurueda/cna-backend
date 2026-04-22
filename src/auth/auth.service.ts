import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AppLoginDto } from './dto/app-login.dto';
import { CreateAppCredentialDto } from './dto/create-app-credential.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppCredentialsService } from './app-credentials.service';
import { EVENTS_APP_CREDENTIAL_SCOPES } from './app-credentials.constants';
import { MailService } from '../mail/mail.service';

const TEMPORARY_PASSWORD = '123456';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly appCredentials: AppCredentialsService,
    private readonly mail: MailService,
  ) {}

  private toPublicUser(
    user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role'>,
    requiresPasswordChange: boolean,
  ) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      requiresPasswordChange,
    };
  }

  private async resolveRequiresPasswordChange(
    user: Pick<User, 'password' | 'requiresPasswordChange'>,
  ) {
    if (user.requiresPasswordChange) return true;
    return bcrypt.compare(TEMPORARY_PASSWORD, user.password);
  }

  private resolveExpiresIn(
    expiresInRaw: string | undefined,
    fallback: string,
  ): number | StringValue {
    if (!expiresInRaw) return fallback as StringValue;
    return /^\d+$/.test(expiresInRaw)
      ? Number(expiresInRaw)
      : (expiresInRaw as StringValue);
  }

  private getRefreshTokenSecret() {
    const refreshSecret =
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      this.config.get<string>('JWT_SECRET');

    if (!refreshSecret) {
      throw new Error('Missing JWT_REFRESH_SECRET/JWT_SECRET');
    }

    return refreshSecret;
  }

  private getRefreshTokenExpiresIn() {
    return this.resolveExpiresIn(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      '7d',
    );
  }

  private async issueAuthTokens(user: User) {
    const requiresPasswordChange =
      await this.resolveRequiresPasswordChange(user);

    const accessToken = this.jwt.sign({
      sub: user.id,
      role: user.role,
      email: user.email,
    });

    const refreshToken = this.jwt.sign(
      {
        sub: user.id,
        tokenType: 'refresh',
      },
      {
        secret: this.getRefreshTokenSecret(),
        expiresIn: this.getRefreshTokenExpiresIn(),
      },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const updateData: Prisma.UserUpdateInput = { refreshTokenHash };

    if (requiresPasswordChange && !user.requiresPasswordChange) {
      updateData.requiresPasswordChange = true;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      user: this.toPublicUser(user, requiresPasswordChange),
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const defaultFirstName = email.split('@')[0] || 'User';
    const firstName = dto.firstName?.trim() || defaultFirstName;
    const lastName = dto.lastName?.trim() || '';

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          password: passwordHash,
          firstName,
          lastName,
          role: Role.GENERAL,
          requiresPasswordChange: dto.password === TEMPORARY_PASSWORD,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Email already registered');
        }
      }
      throw error;
    }

    return this.issueAuthTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.validateUserCredentials(dto.email, dto.password);
    return this.issueAuthTokens(user);
  }

  async createAppCredential(userId: string, dto: CreateAppCredentialDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        requiresPasswordChange: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      ...(await this.appCredentials.issueForUser(
        user,
        dto,
        EVENTS_APP_CREDENTIAL_SCOPES,
      )),
      user: this.toPublicUser(user, user.requiresPasswordChange),
    };
  }

  async appLogin(dto: AppLoginDto) {
    const user = await this.validateUserCredentials(dto.email, dto.password);
    const requiresPasswordChange =
      await this.resolveRequiresPasswordChange(user);

    if (requiresPasswordChange) {
      throw new BadRequestException(
        'Password change required before creating an app credential',
      );
    }

    return {
      ...(await this.appCredentials.issueForUser(
        user,
        dto,
        EVENTS_APP_CREDENTIAL_SCOPES,
      )),
      user: this.toPublicUser(user, false),
    };
  }

  listAppCredentials(userId: string) {
    return this.appCredentials.listForUser(userId);
  }

  revokeAppCredential(userId: string, credentialId: string) {
    return this.appCredentials.revokeForUser(userId, credentialId);
  }

  async refresh(dto: RefreshTokenDto) {
    const refreshToken = dto.refreshToken.trim();
    let payload: { sub?: string; tokenType?: string };

    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.getRefreshTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.sub || payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const validRefreshToken = await bcrypt.compare(
      refreshToken,
      user.refreshTokenHash,
    );
    if (!validRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueAuthTokens(user);
  }

  async setUserRole(dto: UpdateRoleDto) {
    const email = dto.email.toLowerCase().trim();
    const role = dto.role === 'ADMIN' ? Role.ADMIN : Role.GENERAL;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) throw new BadRequestException('User not found');

    const user = await this.prisma.user.update({
      where: { email },
      data: { role },
    });

    return {
      ok: true,
      user: this.toPublicUser(user, user.requiresPasswordChange),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword === TEMPORARY_PASSWORD) {
      throw new BadRequestException(
        'New password cannot be the temporary password',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: passwordHash,
        requiresPasswordChange: false,
      },
    });

    return {
      user: this.toPublicUser(user, false),
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const codeHash = await bcrypt.hash(code, 10);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, codeHash, expiresAt },
      });

      await this.mail.sendPasswordResetCode(email, code);
    }

    return { ok: true };
  }

  async verifyResetCode(dto: VerifyResetCodeDto) {
    const email = dto.email.toLowerCase().trim();
    await this.validateResetCode(email, dto.code);
    return { ok: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.toLowerCase().trim();
    const token = await this.validateResetCode(email, dto.code);

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: token.userId },
      data: { password: passwordHash, requiresPasswordChange: false },
    });

    await this.prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    return { ok: true };
  }

  private async validateResetCode(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('Código inválido o expirado');

    const token = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) throw new BadRequestException('Código inválido o expirado');

    const valid = await bcrypt.compare(code, token.codeHash);
    if (!valid) throw new BadRequestException('Código inválido o expirado');

    return token;
  }

  private async validateUserCredentials(emailRaw: string, password: string) {
    const email = emailRaw.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return user;
  }
}
