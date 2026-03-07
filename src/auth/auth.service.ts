import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      user: this.sanitizeUser(user),
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
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueAuthTokens(user);
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

    return { ok: true, user: this.sanitizeUser(user) };
  }
}
