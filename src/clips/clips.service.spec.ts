import { BadRequestException } from '@nestjs/common';
import { ClipStatus, MatchStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatsService } from '../users/user-stats.service';
import { ClipsService } from './clips.service';

describe('ClipsService', () => {
  const tx = {
    clip: { create: jest.fn() },
    matchReferee: { findMany: jest.fn() },
  };

  const prisma = {
    clip: { findMany: jest.fn() },
    match: { findUnique: jest.fn() },
    competitionReferee: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const userStatsService = {
    incrementClips: jest.fn(),
  };

  let service: ClipsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );
    service = new ClipsService(
      prisma as unknown as PrismaService,
      userStatsService as unknown as UserStatsService,
    );
  });

  it('lists all clips when admin calls GET /clips without matchId', async () => {
    prisma.clip.findMany.mockResolvedValue([{ id: 'clip-1' }]);

    const result = await service.list(undefined, {
      id: 'admin-1',
      role: Role.ADMIN,
    });

    expect(result).toEqual([{ id: 'clip-1' }]);
    expect(prisma.clip.findMany).toHaveBeenCalledTimes(1);
  });

  it('throws when non admin calls GET /clips without matchId', async () => {
    await expect(
      service.list(undefined, { id: 'user-1', role: Role.GENERAL }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates to match listing when matchId is provided', async () => {
    prisma.match.findUnique.mockResolvedValue({ id: 'match-1' });
    prisma.clip.findMany.mockResolvedValue([{ id: 'clip-2' }]);

    const result = await service.list('match-1', {
      id: 'admin-1',
      role: Role.ADMIN,
    });

    expect(result).toEqual([{ id: 'clip-2' }]);
    expect(prisma.match.findUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps thumbnailUrl in createBatch', async () => {
    prisma.match.findUnique.mockResolvedValue({
      id: 'match-1',
      status: MatchStatus.OPEN,
    });
    tx.clip.create.mockResolvedValue({
      id: 'clip-3',
      title: 'Clip 3',
      thumbnailUrl: 'https://thumbs.example.com/clip-3.webp',
      status: ClipStatus.OPEN,
      createdAt: new Date('2026-02-17T00:00:00.000Z'),
    });

    const result = await service.createBatch(
      {
        matchId: 'match-1',
        clips: [
          {
            title: 'Clip 3',
            videoUrl: 'https://videos.example.com/clip-3.mp4',
            thumbnailUrl: ' https://thumbs.example.com/clip-3.webp ',
          },
        ],
      },
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(tx.clip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchId: 'match-1',
          thumbnailUrl: 'https://thumbs.example.com/clip-3.webp',
        }),
        select: expect.objectContaining({
          thumbnailUrl: true,
        }),
      }),
    );
    expect(result).toEqual({
      created: [
        {
          id: 'clip-3',
          title: 'Clip 3',
          thumbnailUrl: 'https://thumbs.example.com/clip-3.webp',
          status: ClipStatus.OPEN,
          createdAt: new Date('2026-02-17T00:00:00.000Z'),
        },
      ],
      failed: [],
    });
    expect(userStatsService.incrementClips).toHaveBeenCalledWith(
      'admin-1',
      1,
      tx,
    );
  });
});
