import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AppCredentialPlatform, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  APP_CREDENTIAL_TOKEN_PREFIX,
  AppCredentialScope,
} from './app-credentials.constants';
import { CreateAppCredentialDto } from './dto/create-app-credential.dto';
import { DeviceInfoDto } from './dto/device-info.dto';
import { AuthenticatedUser } from './auth-user.types';

type CredentialUser = Pick<
  User,
  'id' | 'email' | 'firstName' | 'lastName' | 'role' | 'requiresPasswordChange'
>;

type AppCredentialWithUser = {
  id: string;
  platform: AppCredentialPlatform;
  name: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: CredentialUser;
  secretHash: string;
};

type AppCredentialSummary = Omit<AppCredentialWithUser, 'user' | 'secretHash'>;

@Injectable()
export class AppCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async issueForUser(
    user: CredentialUser,
    dto: CreateAppCredentialDto & { device?: DeviceInfoDto },
    scopes: AppCredentialScope[],
  ) {
    const secret = randomBytes(32).toString('hex');
    const secretHash = await bcrypt.hash(secret, 10);

    const credential = await this.prisma.appCredential.create({
      data: {
        userId: user.id,
        platform: dto.platform,
        name: dto.name.trim(),
        secretHash,
        scopes: [...scopes],
        ...(dto.device && {
          device: {
            create: {
              deviceId: dto.device.deviceId,
              brand: dto.device.brand,
              model: dto.device.model,
              os: dto.device.os,
              osVersion: dto.device.osVersion,
              appVersion: dto.device.appVersion,
              buildVersion: dto.device.buildVersion,
              timezone: dto.device.timezone,
              locale: dto.device.locale,
              isPhysicalDevice: dto.device.isPhysicalDevice,
            },
          },
        }),
      },
      select: this.summarySelect(),
    });

    return {
      appToken: this.buildToken(credential.id, secret),
      tokenType: 'Bearer',
      scopes: [...credential.scopes],
      credential: this.serializeSummary(credential),
    };
  }

  async validateToken(
    token: string,
    requiredScopes: AppCredentialScope[],
  ): Promise<AuthenticatedUser> {
    const { credentialId, secret } = this.parseToken(token);

    const credential = await this.prisma.appCredential.findUnique({
      where: { id: credentialId },
      select: {
        ...this.summarySelect(),
        secretHash: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            requiresPasswordChange: true,
          },
        },
      },
    });

    if (!credential || credential.revokedAt) {
      throw new UnauthorizedException('Invalid app credential');
    }

    const isValid = await bcrypt.compare(secret, credential.secretHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid app credential');
    }

    if (!requiredScopes.every((scope) => credential.scopes.includes(scope))) {
      throw new ForbiddenException(
        'This app credential does not have the required scope',
      );
    }

    const lastUsedAt = new Date();
    await this.prisma.appCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt },
    });

    return {
      ...credential.user,
      authType: 'app_credential',
      appCredentialId: credential.id,
      appCredentialPlatform: credential.platform,
      appCredentialScopes: [...credential.scopes],
    };
  }

  async listForUser(userId: string) {
    const credentials = await this.prisma.appCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: this.summarySelect(),
    });

    return credentials.map((credential) => this.serializeSummary(credential));
  }

  async revokeForUser(userId: string, credentialId: string) {
    const existing = await this.prisma.appCredential.findFirst({
      where: { id: credentialId, userId },
      select: { id: true, revokedAt: true },
    });

    if (!existing) {
      throw new NotFoundException('App credential not found');
    }

    if (existing.revokedAt) {
      return { ok: true };
    }

    await this.prisma.appCredential.update({
      where: { id: credentialId },
      data: { revokedAt: new Date() },
    });

    return { ok: true };
  }

  private buildToken(credentialId: string, secret: string) {
    return `${APP_CREDENTIAL_TOKEN_PREFIX}_${credentialId}.${secret}`;
  }

  private parseToken(token: string) {
    const [prefixWithId, secret] = token.trim().split('.');
    const tokenPrefix = `${APP_CREDENTIAL_TOKEN_PREFIX}_`;

    if (!prefixWithId || !secret || !prefixWithId.startsWith(tokenPrefix)) {
      throw new UnauthorizedException('Invalid app credential');
    }

    const credentialId = prefixWithId.slice(tokenPrefix.length);
    if (!credentialId) {
      throw new UnauthorizedException('Invalid app credential');
    }

    return { credentialId, secret };
  }

  private summarySelect() {
    return {
      id: true,
      platform: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private serializeSummary(credential: AppCredentialSummary) {
    return {
      id: credential.id,
      platform: credential.platform,
      name: credential.name,
      scopes: [...credential.scopes],
      lastUsedAt: credential.lastUsedAt,
      revokedAt: credential.revokedAt,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }
}
