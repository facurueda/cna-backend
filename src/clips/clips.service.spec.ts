import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClipStatus, ClipVisibility, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import { UserStatsService } from '../users/user-stats.service';
import { ClipsService } from './clips.service';

const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';

describe('ClipsService', () => {
  const tx = {
    clip: { create: jest.fn() },
  };

  const prisma = {
    clip: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    clipCollection: { findFirst: jest.fn() },
    clipCategory: { findFirst: jest.fn() },
    project: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const userStatsService = {
    incrementClips: jest.fn(),
  };

  const r2 = {
    buildSourceKey: jest.fn(
      (projectId: string, clipId: string, ext: string) =>
        `${projectId}/clips/${clipId}/source${ext}`,
    ),
    buildThumbnailKey: jest.fn(
      (projectId: string, clipId: string) =>
        `${projectId}/clips/${clipId}/thumbnail.jpg`,
    ),
    createUploadUrl: jest.fn().mockResolvedValue({
      uploadUrl: 'https://r2.example.com/signed-put',
      key: 'key',
      expiresIn: 3600,
    }),
    createReadUrl: jest.fn().mockResolvedValue({
      readUrl: 'https://r2.example.com/signed-get',
      key: 'key',
      expiresIn: 3600,
    }),
    assertKeyBelongsToProject: jest.fn(),
    deleteObject: jest.fn(),
  };

  let service: ClipsService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Por defecto el proyecto no define bucket propio: cae al default del entorno.
    prisma.project.findUnique.mockResolvedValue({ storageBucket: null });
    prisma.$transaction.mockImplementation(async (arg: any) =>
      typeof arg === 'function'
        ? arg(tx)
        : Promise.all(arg as Promise<unknown>[]),
    );
    service = new ClipsService(
      prisma as unknown as PrismaService,
      userStatsService as unknown as UserStatsService,
      r2 as unknown as R2Service,
    );
  });

  it('acota siempre el listado al proyecto activo', async () => {
    prisma.clip.findMany.mockResolvedValue([{ id: 'clip-1' }]);
    prisma.clip.count.mockResolvedValue(1);

    const result = await service.list(
      PROJECT_A,
      {},
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(result.data).toEqual([{ id: 'clip-1', thumbnailUrl: null }]);
    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT_A } }),
    );
  });

  it('un no admin solo ve clips publicos y ya procesados de su proyecto', async () => {
    prisma.clip.findMany.mockResolvedValue([{ id: 'clip-2' }]);
    prisma.clip.count.mockResolvedValue(1);

    await service.list(PROJECT_A, {}, { id: 'user-1', role: Role.GENERAL });

    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: PROJECT_A,
          visibility: ClipVisibility.PUBLIC,
          status: ClipStatus.READY,
        },
      }),
    );
  });

  it('no deja que la query pise el proyecto activo', async () => {
    prisma.clip.findMany.mockResolvedValue([]);
    prisma.clip.count.mockResolvedValue(0);

    await service.list(
      PROJECT_A,
      { projectId: PROJECT_B } as never,
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(prisma.clip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: PROJECT_A }),
      }),
    );
  });

  it('crea el clip en UPLOADING y devuelve la url de subida', async () => {
    prisma.clipCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.clipCollection.findFirst.mockResolvedValue({ id: 'collection-1' });
    tx.clip.create.mockResolvedValue({ id: 'clip-3', title: 'Clip 3' });
    prisma.clip.update.mockResolvedValue({ id: 'clip-3' });

    const result = await service.create(
      PROJECT_A,
      {
        title: 'Clip 3',
        categoryId: 'category-1',
        collectionId: 'collection-1',
        fileName: 'jugada.mp4',
        contentType: 'video/mp4',
      },
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(tx.clip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: PROJECT_A,
          status: ClipStatus.UPLOADING,
        }),
      }),
    );
    expect(result.upload.uploadUrl).toBe('https://r2.example.com/signed-put');
    expect(userStatsService.incrementClips).toHaveBeenCalledWith(
      'admin-1',
      1,
      tx,
    );
  });

  it('rechaza una categoria que pertenece a otro proyecto', async () => {
    prisma.clipCategory.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        PROJECT_A,
        {
          title: 'Clip 5',
          categoryId: 'category-de-project-b',
          fileName: 'x.mp4',
          contentType: 'video/mp4',
        },
        { id: 'admin-1', role: Role.ADMIN },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('firma la subida contra el bucket propio del proyecto', async () => {
    prisma.project.findUnique.mockResolvedValue({
      storageBucket: 'acab-clips-staging',
    });
    prisma.clipCategory.findFirst.mockResolvedValue({ id: 'category-1' });
    tx.clip.create.mockResolvedValue({ id: 'clip-10', title: 'Clip 10' });
    prisma.clip.update.mockResolvedValue({ id: 'clip-10' });

    await service.create(
      PROJECT_A,
      {
        title: 'Clip 10',
        categoryId: 'category-1',
        fileName: 'x.mp4',
        contentType: 'video/mp4',
      },
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(r2.createUploadUrl).toHaveBeenCalledWith(
      expect.any(String),
      'video/mp4',
      { bucket: 'acab-clips-staging' },
    );
  });

  it('cae al bucket por defecto si el proyecto no define uno', async () => {
    prisma.project.findUnique.mockResolvedValue({ storageBucket: null });
    prisma.clip.findFirst.mockResolvedValue({
      id: 'clip-11',
      visibility: ClipVisibility.PUBLIC,
      status: ClipStatus.READY,
      videoKey: `${PROJECT_A}/clips/clip-11/video.mp4`,
      sourceKey: null,
    });

    await service.getPlaybackUrl(PROJECT_A, 'clip-11', {
      id: 'user-1',
      role: Role.GENERAL,
    });

    expect(r2.createReadUrl).toHaveBeenCalledWith(expect.any(String), {
      bucket: null,
    });
  });

  it('deja el clip READY al confirmar la subida', async () => {
    // Si quedara en PROCESSING, ningun no-admin lo veria nunca: la compresion
    // ocurre en el browser, asi que lo que llego a R2 ya es servible.
    prisma.clip.findFirst.mockResolvedValue({
      id: 'clip-9',
      sourceKey: `${PROJECT_A}/clips/clip-9/source.mp4`,
      videoKey: null,
      thumbnailKey: null,
    });
    prisma.clip.update.mockResolvedValue({ id: 'clip-9' });

    await service.markUploaded(
      PROJECT_A,
      'clip-9',
      {},
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ClipStatus.READY,
          videoKey: `${PROJECT_A}/clips/clip-9/source.mp4`,
        }),
      }),
    );
  });

  it('no guarda thumbnailKey si el browser no confirmo la miniatura', async () => {
    // Guardar la key sin el objeto detras haria que la grilla firme una URL que
    // devuelve 404, en vez de caer al degradado.
    prisma.clip.findFirst.mockResolvedValue({
      id: 'clip-12',
      sourceKey: `${PROJECT_A}/clips/clip-12/source.mp4`,
      videoKey: null,
      thumbnailKey: null,
    });
    prisma.clip.update.mockResolvedValue({ id: 'clip-12', thumbnailKey: null });

    await service.markUploaded(
      PROJECT_A,
      'clip-12',
      {},
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ thumbnailKey: undefined }),
      }),
    );
  });

  it('guarda la thumbnailKey cuando el browser confirmo la subida', async () => {
    prisma.clip.findFirst.mockResolvedValue({
      id: 'clip-13',
      sourceKey: `${PROJECT_A}/clips/clip-13/source.mp4`,
      videoKey: null,
      thumbnailKey: null,
    });
    prisma.clip.update.mockResolvedValue({
      id: 'clip-13',
      thumbnailKey: `${PROJECT_A}/clips/clip-13/thumbnail.jpg`,
    });

    const result = await service.markUploaded(
      PROJECT_A,
      'clip-13',
      { hasThumbnail: true },
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(prisma.clip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          thumbnailKey: `${PROJECT_A}/clips/clip-13/thumbnail.jpg`,
        }),
      }),
    );
    expect(result.thumbnailUrl).toBe('https://r2.example.com/signed-get');
  });

  it('devuelve thumbnailUrl null en el listado cuando el clip no tiene miniatura', async () => {
    prisma.clip.findMany.mockResolvedValue([
      { id: 'clip-14', thumbnailKey: null },
    ]);
    prisma.clip.count.mockResolvedValue(1);

    const result = await service.list(
      PROJECT_A,
      {},
      { id: 'admin-1', role: Role.ADMIN },
    );

    expect(result.data).toEqual([
      { id: 'clip-14', thumbnailKey: null, thumbnailUrl: null },
    ]);
    // Sin miniaturas no se firma nada: ni siquiera se resuelve el bucket.
    expect(r2.createReadUrl).not.toHaveBeenCalled();
  });

  it('devuelve 404 al pedir un clip de otro proyecto', async () => {
    prisma.clip.findFirst.mockResolvedValue(null);

    await expect(
      service.getById(PROJECT_A, 'clip-de-project-b', {
        id: 'admin-1',
        role: Role.ADMIN,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloquea a un no admin sobre clips privados', async () => {
    prisma.clip.findFirst.mockResolvedValue({
      id: 'clip-4',
      visibility: ClipVisibility.PRIVATE,
      status: ClipStatus.READY,
    });

    await expect(
      service.getById(PROJECT_A, 'clip-4', {
        id: 'user-1',
        role: Role.GENERAL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloquea a un no admin sobre clips publicos que todavia se procesan', async () => {
    prisma.clip.findFirst.mockResolvedValue({
      id: 'clip-7',
      visibility: ClipVisibility.PUBLIC,
      status: ClipStatus.PROCESSING,
    });

    await expect(
      service.getById(PROJECT_A, 'clip-7', {
        id: 'user-1',
        role: Role.GENERAL,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('valida que la key de reproduccion sea del proyecto activo', async () => {
    prisma.clip.findFirst.mockResolvedValue({
      id: 'clip-8',
      visibility: ClipVisibility.PUBLIC,
      status: ClipStatus.READY,
      videoKey: `${PROJECT_A}/clips/clip-8/video.mp4`,
      sourceKey: null,
    });

    await service.getPlaybackUrl(PROJECT_A, 'clip-8', {
      id: 'user-1',
      role: Role.GENERAL,
    });

    expect(r2.assertKeyBelongsToProject).toHaveBeenCalledWith(
      `${PROJECT_A}/clips/clip-8/video.mp4`,
      PROJECT_A,
    );
  });

  it('publica seteando visibilidad y publishedAt', async () => {
    prisma.clip.findFirst.mockResolvedValue({ id: 'clip-6' });
    prisma.clip.update.mockResolvedValue({
      id: 'clip-6',
      visibility: ClipVisibility.PUBLIC,
    });

    await service.setVisibility(PROJECT_A, 'clip-6', ClipVisibility.PUBLIC, {
      id: 'admin-1',
      role: Role.ADMIN,
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
