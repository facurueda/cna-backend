import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClipVisibility, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClipCollectionDto } from './dto/create-clip-collection.dto';
import { UpdateClipCollectionDto } from './dto/update-clip-collection.dto';

type AuthUser = { id: string; role: Role };

@Injectable()
export class ClipCollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, includeCounts = false) {
    const isAdmin = user.role === Role.ADMIN;

    return this.prisma.clipCollection.findMany({
      where: isAdmin
        ? undefined
        : { clips: { some: { visibility: ClipVisibility.PUBLIC } } },
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
                  clips: isAdmin
                    ? true
                    : { where: { visibility: ClipVisibility.PUBLIC } },
                },
              },
            }
          : {}),
      },
    });
  }

  async getById(id: string, user: AuthUser) {
    const collection = await this.prisma.clipCollection.findUnique({
      where: { id },
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

    const publicClipsCount = await this.prisma.clip.count({
      where: {
        collectionId: id,
        visibility: ClipVisibility.PUBLIC,
      },
    });

    if (publicClipsCount === 0) {
      throw new ForbiddenException('No tenés acceso a esta colección');
    }

    return collection;
  }

  async create(dto: CreateClipCollectionDto) {
    return this.prisma.clipCollection.create({
      data: {
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

  async update(id: string, dto: UpdateClipCollectionDto) {
    await this.assertCollectionExists(id);

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

  async remove(id: string) {
    await this.assertCollectionExists(id);

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

  private async assertCollectionExists(id: string) {
    const collection = await this.prisma.clipCollection.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!collection) {
      throw new NotFoundException('Colección no encontrada');
    }
  }
}
