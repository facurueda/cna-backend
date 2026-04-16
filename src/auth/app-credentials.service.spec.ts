import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AppCredentialPlatform, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppCredentialsService } from './app-credentials.service';

describe('AppCredentialsService', () => {
  const prisma = {
    appCredential: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: AppCredentialsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppCredentialsService(prisma as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('issues an app token and stores only the hashed secret', async () => {
    prisma.appCredential.create.mockResolvedValue({
      id: 'cred-1',
      platform: AppCredentialPlatform.WINDOWS,
      name: 'Cabina principal',
      scopes: ['events:read', 'events:write'],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date('2026-04-15T12:00:00.000Z'),
      updatedAt: new Date('2026-04-15T12:00:00.000Z'),
    });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('secret-hash' as never);

    const result = await service.issueForUser(
      {
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'User',
        lastName: 'Test',
        role: Role.GENERAL,
        requiresPasswordChange: false,
      },
      {
        platform: AppCredentialPlatform.WINDOWS,
        name: 'Cabina principal',
      },
      ['events:read', 'events:write'],
    );

    expect(prisma.appCredential.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        platform: AppCredentialPlatform.WINDOWS,
        name: 'Cabina principal',
        secretHash: 'secret-hash',
        scopes: ['events:read', 'events:write'],
      },
      select: {
        id: true,
        platform: true,
        name: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(result.tokenType).toBe('Bearer');
    expect(result.appToken).toMatch(/^vyroapp_cred-1\./);
  });

  it('validates a credential token and returns the scoped app user', async () => {
    prisma.appCredential.findUnique.mockResolvedValue({
      id: 'cred-1',
      platform: AppCredentialPlatform.ANDROID,
      name: 'Tablet cancha',
      scopes: ['events:read', 'events:write'],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date('2026-04-15T12:00:00.000Z'),
      updatedAt: new Date('2026-04-15T12:00:00.000Z'),
      secretHash: 'stored-secret-hash',
      user: {
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'User',
        lastName: 'Test',
        role: Role.ADMIN,
        requiresPasswordChange: false,
      },
    });
    prisma.appCredential.update.mockResolvedValue(undefined);
    jest
      .spyOn(bcrypt, 'compare')
      .mockImplementation(async (plain: string, hashed: string) => {
        if (plain === 'super-secret' && hashed === 'stored-secret-hash') {
          return true as never;
        }

        return false as never;
      });

    const result = await service.validateToken('vyroapp_cred-1.super-secret', [
      'events:write',
    ]);

    expect(result).toEqual({
      id: 'user-1',
      email: 'user@test.com',
      firstName: 'User',
      lastName: 'Test',
      role: Role.ADMIN,
      requiresPasswordChange: false,
      authType: 'app_credential',
      appCredentialId: 'cred-1',
      appCredentialPlatform: AppCredentialPlatform.ANDROID,
      appCredentialScopes: ['events:read', 'events:write'],
    });
    expect(prisma.appCredential.update).toHaveBeenCalledWith({
      where: { id: 'cred-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it('rejects app credentials without the required scope', async () => {
    prisma.appCredential.findUnique.mockResolvedValue({
      id: 'cred-1',
      platform: AppCredentialPlatform.ANDROID,
      name: 'Tablet cancha',
      scopes: ['events:read'],
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date('2026-04-15T12:00:00.000Z'),
      updatedAt: new Date('2026-04-15T12:00:00.000Z'),
      secretHash: 'stored-secret-hash',
      user: {
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'User',
        lastName: 'Test',
        role: Role.GENERAL,
        requiresPasswordChange: false,
      },
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    await expect(
      service.validateToken('vyroapp_cred-1.super-secret', ['events:write']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects malformed or unknown app credentials', async () => {
    await expect(
      service.validateToken('invalid-token', ['events:read']),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    prisma.appCredential.findUnique.mockResolvedValue(null);
    await expect(
      service.validateToken('vyroapp_missing.super-secret', ['events:read']),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
