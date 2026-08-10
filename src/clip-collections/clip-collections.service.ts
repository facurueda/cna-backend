import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  canReachCollection,
  collectionGroupWhere,
  getUserGroupIds,
  VISIBLE_TO_MEMBERS,
} from '../clips/clip-access';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClipCollectionDto } from './dto/create-clip-collection.dto';
import { UpdateClipCollectionDto } from './dto/update-clip-collection.dto';

type AuthUser = { id: string; role: Role };

const collectionSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  groups: { select: { groupId: true } },
} as const;

@Injectable()
export class ClipCollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, user: AuthUser, includeCounts = false) {
    const isAdmin = user.role === Role.ADMIN;
    const groupIds = isAdmin ? [] : await getUserGroupIds(this.prisma, user.id);

    const collections = await this.prisma.clipCollection.findMany({
      where: {
        projectId,
        ...(isAdmin
          ? {}
          : {
              clips: { some: VISIBLE_TO_MEMBERS },
              ...collectionGroupWhere(groupIds),
            }),
      },
      orderBy: [{ name: 'asc' }],
      select: {
        ...collectionSelect,
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

    return collections.map(toCollectionResponse);
  }

  async getById(projectId: string, id: string, user: AuthUser) {
    const collection = await this.prisma.clipCollection.findFirst({
      where: { id, projectId },
      select: collectionSelect,
    });

    if (!collection) {
      throw new NotFoundException('Colección no encontrada');
    }

    if (user.role === Role.ADMIN) {
      return toCollectionResponse(collection);
    }

    const groupIds = await getUserGroupIds(this.prisma, user.id);
    const collectionGroupIds = collection.groups.map((item) => item.groupId);

    if (!canReachCollection(collectionGroupIds, groupIds)) {
      throw new ForbiddenException('No tenés acceso a esta colección');
    }

    const visibleClipsCount = await this.prisma.clip.count({
      where: { collectionId: id, ...VISIBLE_TO_MEMBERS },
    });

    if (visibleClipsCount === 0) {
      throw new ForbiddenException('No tenés acceso a esta colección');
    }

    return toCollectionResponse(collection);
  }

  async create(projectId: string, dto: CreateClipCollectionDto) {
    const groupIds = await this.resolveGroupIds(dto.groupIds);

    const collection = await this.prisma.clipCollection.create({
      data: {
        projectId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        groups: { create: groupIds.map((groupId) => ({ groupId })) },
      },
      select: collectionSelect,
    });

    return toCollectionResponse(collection);
  }

  async update(projectId: string, id: string, dto: UpdateClipCollectionDto) {
    await this.assertCollectionExists(projectId, id);

    // `undefined` deja los grupos como estaban; un array (incluso vacío) los
    // reemplaza. Un array vacío es "sin restricción", no "sin acceso".
    const groupIds =
      dto.groupIds === undefined
        ? undefined
        : await this.resolveGroupIds(dto.groupIds);

    const collection = await this.prisma.clipCollection.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description == null ? undefined : dto.description.trim() || null,
        ...(groupIds === undefined
          ? {}
          : {
              groups: {
                deleteMany: {},
                create: groupIds.map((groupId) => ({ groupId })),
              },
            }),
      },
      select: collectionSelect,
    });

    return toCollectionResponse(collection);
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

  /**
   * Valida que los grupos existan. Un id inventado tiene que fallar fuerte: si
   * se guardara, la colección quedaría restringida a un grupo al que nadie
   * pertenece y sería invisible para todos sin explicación.
   *
   * TODO(multiproyecto): `Group` todavía no tiene `projectId`, así que esto no
   * puede verificar que el grupo sea del proyecto activo. Es el primer camino de
   * fuga entre proyectos el día que exista el segundo. Ver `plans/`.
   */
  private async resolveGroupIds(groupIds?: string[]) {
    const unique = Array.from(
      new Set((groupIds ?? []).map((id) => id.trim()).filter(Boolean)),
    );

    if (!unique.length) return [];

    const found = await this.prisma.group.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });

    if (found.length !== unique.length) {
      const existing = new Set(found.map((group) => group.id));
      const missing = unique.filter((id) => !existing.has(id));
      throw new BadRequestException(
        `Grupos inexistentes: ${missing.join(', ')}`,
      );
    }

    return unique;
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

/** Aplana la tabla intermedia: el cliente recibe `groupIds`, no filas del join. */
function toCollectionResponse<T extends { groups: { groupId: string }[] }>(
  collection: T,
) {
  const { groups, ...rest } = collection;
  return { ...rest, groupIds: groups.map((item) => item.groupId) };
}
