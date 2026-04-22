import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AppCredentialPlatform, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const jwt = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };

      return values[key];
    }),
  };

  const appCredentials = {
    issueForUser: jest.fn(),
    listForUser: jest.fn(),
    revokeForUser: jest.fn(),
  };

  const baseUser: User = {
    id: 'user-1',
    email: 'user@test.com',
    firstName: 'User',
    lastName: 'Test',
    password: 'password-hash',
    role: Role.GENERAL,
    refreshTokenHash: null,
    requiresPasswordChange: false,
    createdAt: new Date('2026-02-17T00:00:00.000Z'),
    updatedAt: new Date('2026-02-17T00:00:00.000Z'),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      appCredentials as never,
      { sendPasswordResetCode: jest.fn() } as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns access and refresh tokens on login', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);
    jwt.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    jest
      .spyOn(bcrypt, 'compare')
      .mockImplementation(async (plain: string, hashed: string) => {
        if (plain === 'User123!' && hashed === baseUser.password) {
          return true as never;
        }

        if (plain === '123456' && hashed === baseUser.password) {
          return false as never;
        }

        return false as never;
      });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('refresh-token-hash' as never);

    const result = await service.login({
      email: baseUser.email,
      password: 'User123!',
    });

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      user: {
        id: baseUser.id,
        email: baseUser.email,
        firstName: baseUser.firstName,
        lastName: baseUser.lastName,
        role: baseUser.role,
        requiresPasswordChange: false,
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { refreshTokenHash: 'refresh-token-hash' },
    });
  });

  it('returns requiresPasswordChange true for legacy users still on the temporary password', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      requiresPasswordChange: true,
    });
    jwt.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    jest
      .spyOn(bcrypt, 'compare')
      .mockImplementation(async (plain: string, hashed: string) => {
        if (plain === '123456' && hashed === baseUser.password) {
          return true as never;
        }

        return false as never;
      });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('refresh-token-hash' as never);

    const result = await service.login({
      email: baseUser.email,
      password: '123456',
    });

    expect(result.user.requiresPasswordChange).toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: {
        refreshTokenHash: 'refresh-token-hash',
        requiresPasswordChange: true,
      },
    });
  });

  it('refreshes tokens when refresh token is valid', async () => {
    const userWithRefresh: User = {
      ...baseUser,
      refreshTokenHash: 'stored-refresh-hash',
    };

    jwt.verify.mockReturnValue({ sub: baseUser.id, tokenType: 'refresh' });
    prisma.user.findUnique.mockResolvedValue(userWithRefresh);
    prisma.user.update.mockResolvedValue(baseUser);
    jwt.sign
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');
    jest
      .spyOn(bcrypt, 'compare')
      .mockImplementation(async (plain: string, hashed: string) => {
        if (
          plain === 'valid-refresh-token' &&
          hashed === userWithRefresh.refreshTokenHash
        ) {
          return true as never;
        }

        if (plain === '123456' && hashed === userWithRefresh.password) {
          return false as never;
        }

        return false as never;
      });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-refresh-hash' as never);

    const result = await service.refresh({
      refreshToken: 'valid-refresh-token',
    });

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { refreshTokenHash: 'new-refresh-hash' },
    });
  });

  it('throws unauthorized when refresh token is invalid', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    await expect(
      service.refresh({ refreshToken: 'invalid-refresh-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws unauthorized when user has no stored refresh token', async () => {
    jwt.verify.mockReturnValue({ sub: baseUser.id, tokenType: 'refresh' });
    prisma.user.findUnique.mockResolvedValue(baseUser);

    await expect(
      service.refresh({ refreshToken: 'valid-refresh-token' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('changes password and clears requiresPasswordChange', async () => {
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-password-hash' as never);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      password: 'new-password-hash',
      requiresPasswordChange: false,
    });

    const result = await service.changePassword(baseUser.id, {
      newPassword: 'NewPass123!',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: {
        password: 'new-password-hash',
        requiresPasswordChange: false,
      },
    });
    expect(result).toEqual({
      user: {
        id: baseUser.id,
        email: baseUser.email,
        firstName: baseUser.firstName,
        lastName: baseUser.lastName,
        role: baseUser.role,
        requiresPasswordChange: false,
      },
    });
  });

  it('rejects using the temporary password as the new password', async () => {
    await expect(
      service.changePassword(baseUser.id, { newPassword: '123456' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('creates an app credential for valid app login', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    appCredentials.issueForUser.mockResolvedValue({
      appToken: 'vyroapp_device.secret',
      tokenType: 'Bearer',
      scopes: ['events:read', 'events:write'],
      credential: {
        id: 'cred-1',
        platform: AppCredentialPlatform.ANDROID,
        name: 'Tablet cancha',
        scopes: ['events:read', 'events:write'],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date('2026-04-15T12:00:00.000Z'),
        updatedAt: new Date('2026-04-15T12:00:00.000Z'),
      },
    });
    jest
      .spyOn(bcrypt, 'compare')
      .mockImplementation(async (plain: string, hashed: string) => {
        if (plain === 'User123!' && hashed === baseUser.password) {
          return true as never;
        }

        if (plain === '123456' && hashed === baseUser.password) {
          return false as never;
        }

        return false as never;
      });

    const result = await service.appLogin({
      email: baseUser.email,
      password: 'User123!',
      platform: AppCredentialPlatform.ANDROID,
      name: 'Tablet cancha',
    });

    expect(appCredentials.issueForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: baseUser.id,
        email: baseUser.email,
      }),
      {
        platform: AppCredentialPlatform.ANDROID,
        name: 'Tablet cancha',
        email: baseUser.email,
        password: 'User123!',
      },
      ['events:read', 'events:write'],
    );
    expect(result).toEqual({
      appToken: 'vyroapp_device.secret',
      tokenType: 'Bearer',
      scopes: ['events:read', 'events:write'],
      credential: {
        id: 'cred-1',
        platform: AppCredentialPlatform.ANDROID,
        name: 'Tablet cancha',
        scopes: ['events:read', 'events:write'],
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date('2026-04-15T12:00:00.000Z'),
        updatedAt: new Date('2026-04-15T12:00:00.000Z'),
      },
      user: {
        id: baseUser.id,
        email: baseUser.email,
        firstName: baseUser.firstName,
        lastName: baseUser.lastName,
        role: baseUser.role,
        requiresPasswordChange: false,
      },
    });
  });

  it('rejects app login while the user still requires a password change', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      requiresPasswordChange: true,
    });
    jest
      .spyOn(bcrypt, 'compare')
      .mockImplementation(async (plain: string, hashed: string) => {
        if (plain === 'User123!' && hashed === baseUser.password) {
          return true as never;
        }

        return false as never;
      });

    await expect(
      service.appLogin({
        email: baseUser.email,
        password: 'User123!',
        platform: AppCredentialPlatform.WINDOWS,
        name: 'PC de cabina',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(appCredentials.issueForUser).not.toHaveBeenCalled();
  });
});
