import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClipVisibility, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatsService } from '../users/user-stats.service';
import { BatchCreateClipsDto } from './dto/batch-create-clips.dto';
import { CreateClipDto } from './dto/create-clip.dto';
import { ListClipsQueryDto } from './dto/list-clips.query.dto';
import { UpdateClipDto } from './dto/update-clip.dto';

type AuthUser = { id: string; role: Role };

const clipInclude = {
  collection: {
    select: { id: true, name: true, description: true },
  },
  category: {
    select: { id: true, name: true },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, role: true },
  },
} as const;

@Injectable()
export class ClipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStatsService: UserStatsService,
  ) {}

  async list(query: ListClipsQueryDto, user: AuthUser) {
    const where = this.buildListWhere(query, user);
    const take = query.limit ?? this.normalizeTake(query.take);
    const page = query.page ?? 1;
    const skip = query.page != null ? (page - 1) * take : this.normalizeSkip(query.skip);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.clip.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: clipInclude,
      }),
      this.prisma.clip.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async createBatch(dto: BatchCreateClipsDto, user: AuthUser) {
    const created: {
      id: string;
      title: string;
      thumbnailUrl: string | null;
      status: string;
      createdAt: Date;
    }[] = [];
    const failed: { index: number; reason: string }[] = [];

    for (let i = 0; i < dto.clips.length; i++) {
      const item = dto.clips[i];
      try {
        if (!dto.collectionId) {
          throw new Error('collectionId es requerido');
        }

        const categoryId = item.categoryIds?.[0];
        if (!categoryId) {
          throw new Error('categoryIds debe tener al menos un elemento');
        }

        await this.assertCollectionExists(dto.collectionId);
        await this.assertCategoryExists(categoryId);

        const collectionId = dto.collectionId;

        const clip = await this.prisma.$transaction(async (tx) => {
          const newClip = await tx.clip.create({
            data: {
              collectionId,
              categoryId,
              title: item.title.trim(),
              description: '',
              videoUrl: item.videoUrl.trim(),
              thumbnailUrl: item.thumbnailUrl?.trim(),
              duration: item.duration,
              createdById: user.id,
            },
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              visibility: true,
              createdAt: true,
            },
          });

          await this.userStatsService.incrementClips(user.id, 1, tx);
          return newClip;
        });

        created.push({
          id: clip.id,
          title: clip.title,
          thumbnailUrl: clip.thumbnailUrl,
          status: clip.visibility,
          createdAt: clip.createdAt,
        });
      } catch (err: unknown) {
        const reason =
          err instanceof Error ? err.message : 'Error desconocido';
        failed.push({ index: i, reason });
      }
    }

    return { created, failed };
  }

  async create(dto: CreateClipDto, user: AuthUser) {
    await this.assertCollectionExists(dto.collectionId);
    await this.assertCategoryExists(dto.categoryId);

    return this.prisma.$transaction(async (tx) => {
      const createdClip = await tx.clip.create({
        data: {
          collectionId: dto.collectionId,
          categoryId: dto.categoryId,
          title: dto.title.trim(),
          description: dto.description.trim(),
          videoUrl: dto.videoUrl.trim(),
          thumbnailUrl: dto.thumbnailUrl?.trim(),
          duration: dto.duration,
          createdById: user.id,
        },
        include: clipInclude,
      });

      await this.userStatsService.incrementClips(user.id, 1, tx);
      return createdClip;
    });
  }

  async getById(id: string, user: AuthUser) {
    const clip = await this.prisma.clip.findUnique({
      where: { id },
      include: clipInclude,
    });

    if (!clip) throw new NotFoundException('Clip no encontrado');
    this.assertCanAccessClip(clip.visibility, user);

    return clip;
  }

  async update(id: string, dto: UpdateClipDto, user: AuthUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede editar clips');
    }

    await this.assertClipExists(id);

    if (dto.collectionId) {
      await this.assertCollectionExists(dto.collectionId);
    }

    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    return this.prisma.clip.update({
      where: { id },
      data: {
        collectionId: dto.collectionId,
        categoryId: dto.categoryId,
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        videoUrl: dto.videoUrl?.trim(),
        thumbnailUrl: dto.thumbnailUrl?.trim(),
        duration: dto.duration,
      },
      include: clipInclude,
    });
  }

  async remove(id: string, user: AuthUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede borrar clips');
    }

    await this.assertClipExists(id);
    await this.prisma.clip.delete({ where: { id } });
    return { ok: true };
  }

  async setVisibility(id: string, visibility: ClipVisibility, user: AuthUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede cambiar visibilidad');
    }

    await this.assertClipExists(id);

    return this.prisma.clip.update({
      where: { id },
      data: {
        visibility,
        publishedAt: visibility === ClipVisibility.PUBLIC ? new Date() : null,
      },
      include: clipInclude,
    });
  }

  private buildListWhere(
    query: ListClipsQueryDto,
    user: AuthUser,
  ): Prisma.ClipWhereInput {
    const where: Prisma.ClipWhereInput = {};

    if (query.collectionId?.trim()) {
      where.collectionId = query.collectionId.trim();
    }

    if (query.categoryId?.trim()) {
      where.categoryId = query.categoryId.trim();
    }

    if (query.search?.trim()) {
      where.title = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    if (user.role === Role.ADMIN) {
      if (query.visibility) {
        where.visibility = query.visibility;
      }
      return where;
    }

    where.visibility = ClipVisibility.PUBLIC;
    return where;
  }

  private normalizeSkip(value?: number) {
    if (value == null || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
  }

  private normalizeTake(value?: number) {
    if (value == null || !Number.isFinite(value)) return 20;
    return Math.min(100, Math.max(1, Math.trunc(value)));
  }

  private assertCanAccessClip(visibility: ClipVisibility, user: AuthUser) {
    if (user.role === Role.ADMIN) return;
    if (visibility === ClipVisibility.PUBLIC) return;
    throw new ForbiddenException('No tenés acceso a este clip');
  }

  private async assertClipExists(id: string) {
    const clip = await this.prisma.clip.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!clip) throw new NotFoundException('Clip no encontrado');
    return clip;
  }

  private async assertCollectionExists(collectionId: string) {
    const collection = await this.prisma.clipCollection.findUnique({
      where: { id: collectionId },
      select: { id: true },
    });

    if (!collection) throw new NotFoundException('Colección no encontrada');
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.clipCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) throw new NotFoundException('Categoría no encontrada');
  }
}
