import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClipStatus, ClipVisibility, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClipCollectionDto } from './dto/create-clip-collection.dto';
import { UpdateClipCollectionDto } from './dto/update-clip-collection.dto';

type AuthUser = { id: string; role: Role };

/** Un no-admin solo "ve" clips publicos y ya procesados. */
const VISIBLE_TO_MEMBERS = {
  visibility: ClipVisibility.PUBLIC,
  status: ClipStatus.READY,
} as const;

@Injectable()
export class ClipCollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, user: AuthUser, includeCounts = false) {
    const isAdmin = user.role === Role.ADMIN;

    return this.prisma.clipCollection.findMany({
      where: {
        projectId,
        ...(isAdmin ? {} : { clips: { some: VISIBLE_TO_MEMBERS } }),
      },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        ...(includeCounts
          ? {
              _count: {
                select: {
                  clips: isAdmin ? true : { where: VISIBLE_TO_MEMBERS },
                },
              },
            }
          : {}),
      },
    });
  }

  async getById(projectId: string, id: string, user: AuthUser) {
    const collection = await this.prisma.clipCollection.findFirst({
      where: { id, projectId },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!collection) {
      throw new NotFoundException('Colección no encontrada');
    }

    if (user.role === Role.ADMIN) {
      return collection;
    }

    const visibleClipsCount = await this.prisma.clip.count({
      where: { collectionId: id, ...VISIBLE_TO_MEMBERS },
    });

    if (visibleClipsCount === 0) {
      throw new ForbiddenException('No tenés acceso a esta colección');
    }

    return collection;
  }

  async create(projectId: string, dto: CreateClipCollectionDto) {
    return this.prisma.clipCollection.create({
      data: {
        projectId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(projectId: string, id: string, dto: UpdateClipCollectionDto) {
    await this.assertCollectionExists(projectId, id);

    return this.prisma.clipCollection.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description == null ? undefined : dto.description.trim() || null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(projectId: string, id: string) {
    await this.assertCollectionExists(projectId, id);

    const clipsCount = await this.prisma.clip.count({
      where: { collectionId: id },
    });

    if (clipsCount > 0) {
      throw new BadRequestException(
        'No se puede borrar una colección con clips asociados',
      );
    }

    await this.prisma.clipCollection.delete({ where: { id } });
    return { ok: true };
  }

  /** Acota por proyecto: una coleccion de otro proyecto es un 404, no un 403. */
  private async assertCollectionExists(projectId: string, id: string) {
    const collection = await this.prisma.clipCollection.findFirst({
      where: { id, projectId },
      select: { id: true },
    });

    if (!collection) {
      throw new NotFoundException('Colección no encontrada');
    }
  }
}
