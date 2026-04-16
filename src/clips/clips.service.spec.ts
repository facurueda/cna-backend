import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClipVisibility, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatsService } from '../users/user-stats.service';
import { ClipsService } from './clips.service';

describe('ClipsService', () => {
  const tx = {
    clip: { create: jest.fn() },
  };

  const prisma = {
    clip: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    clipCollection: { findUnique: jest.fn() },
    clipCategory: { findUnique: jest.fn() },
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

  it('lists clips for admin without forcing public visibility', async () => {
    prisma.clip.findMany.mockResolvedValue([{ id: 'clip-1' }]);

    const result = await service.list(
      {},
      {
        id: 'admin-1',
        role: Role.ADMIN,
      },
    );

    expect(result).toEqual([{ id: 'clip-1' }]);
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });

  it('lists only public clips for non admin users', async () => {
    prisma.clip.findMany.mockResolvedValue([{ id: 'clip-2' }]);

    const result = await service.list(
      {},
      {
        id: 'user-1',
        role: Role.GENERAL,
      },
    );

    expect(result).toEqual([{ id: 'clip-2' }]);
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visibility: ClipVisibility.PUBLIC },
      }),
    );
  });

  it('creates clips as private by default', async () => {
    prisma.clipCollection.findUnique.mockResolvedValue({ id: 'collection-1' });
    prisma.clipCategory.findUnique.mockResolvedValue({ id: 'category-1' });
    tx.clip.create.mockResolvedValue({
      id: 'clip-3',
      title: 'Clip 3',
      visibility: ClipVisibility.PRIVATE,
    });

    const result = await service.create(
      {
        collectionId: 'collection-1',
        categoryId: 'category-1',
        title: 'Clip 3',
        description: 'Decision final',
        videoUrl: 'https://videos.example.com/clip-3.mp4',
      },
      {
        id: 'admin-1',
        role: Role.ADMIN,
      },
    );

    expect(result).toEqual({
      id: 'clip-3',
      title: 'Clip 3',
      visibility: ClipVisibility.PRIVATE,
    });
    expect(tx.clip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          collectionId: 'collection-1',
          categoryId: 'category-1',
          title: 'Clip 3',
          description: 'Decision final',
          videoUrl: 'https://videos.example.com/clip-3.mp4',
        }),
      }),
    );
    expect(userStatsService.incrementClips).toHaveBeenCalledWith(
      'admin-1',
      1,
      tx,
    );
  });

  it('blocks access to private clips for non admin users', async () => {
    prisma.clip.findUnique.mockResolvedValue({
      id: 'clip-4',
      visibility: ClipVisibility.PRIVATE,
    });

    await expect(
      service.getById('clip-4', { id: 'user-1', role: Role.GENERAL }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when category does not exist on create', async () => {
    prisma.clipCollection.findUnique.mockResolvedValue({ id: 'collection-1' });
    prisma.clipCategory.findUnique.mockResolvedValue(null);

    await expect(
      service.create(
        {
          collectionId: 'collection-1',
          categoryId: 'missing-category',
          title: 'Clip 5',
          description: 'Decision final',
          videoUrl: 'https://videos.example.com/clip-5.mp4',
        },
        { id: 'admin-1', role: Role.ADMIN },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('publishes clips by setting public visibility and publishedAt', async () => {
    prisma.clip.findUnique.mockResolvedValue({ id: 'clip-6' });
    prisma.clip.update.mockResolvedValue({
      id: 'clip-6',
      visibility: ClipVisibility.PUBLIC,
    });

    const result = await service.setVisibility(
      'clip-6',
      ClipVisibility.PUBLIC,
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(result).toEqual({
      id: 'clip-6',
      visibility: ClipVisibility.PUBLIC,
    });
    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visibility: ClipVisibility.PUBLIC,
          publishedAt: expect.any(Date),
        }),
      }),
    );
  });
});
