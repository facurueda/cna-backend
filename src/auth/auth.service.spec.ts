import { UnauthorizedException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
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

  const baseUser: User = {
    id: 'user-1',
    email: 'user@test.com',
    firstName: 'User',
    lastName: 'Test',
    password: 'password-hash',
    role: Role.GENERAL,
    refreshTokenHash: null,
    createdAt: new Date('2026-02-17T00:00:00.000Z'),
    updatedAt: new Date('2026-02-17T00:00:00.000Z'),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(prisma as never, jwt as never, config as never);
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
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
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
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { refreshTokenHash: 'refresh-token-hash' },
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
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
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
});
