import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateButtonLayoutDto } from './dto/create-button-layout.dto';
import { ButtonLayoutTileDto } from './dto/button-layout-tile.dto';
import { UpdateButtonLayoutDto } from './dto/update-button-layout.dto';

type AuthUser = { id: string; role: Role };

type ButtonLayoutWithTiles = Prisma.ButtonLayoutGetPayload<{
  include: { tiles: true };
}>;

@Injectable()
export class ButtonLayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateButtonLayoutDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const createdLayout = await tx.buttonLayout.create({
        data: {
          userId: user.id,
          name: dto.name.trim(),
        },
        select: { id: true },
      });

      if (dto.tiles.length > 0) {
        await tx.buttonLayoutTile.createMany({
          data: this.buildTileRows(createdLayout.id, dto.tiles),
        });
      }

      const layout = await tx.buttonLayout.findUnique({
        where: { id: createdLayout.id },
        include: {
          tiles: {
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!layout) {
        throw new NotFoundException('Botonera no encontrada');
      }

      return this.serializeLayout(layout);
    });
  }

  async findMyLayouts(user: AuthUser) {
    const layouts = await this.prisma.buttonLayout.findMany({
      where: { userId: user.id },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        tiles: {
          orderBy: { position: 'asc' },
        },
      },
    });

    return layouts.map((layout) => this.serializeLayout(layout));
  }

  async findOne(id: string, user: AuthUser) {
    const layout = await this.findAccessibleLayout(id, user);
    return this.serializeLayout(layout);
  }

  async update(id: string, dto: UpdateButtonLayoutDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.buttonLayout.findUnique({
        where: { id },
        include: {
          tiles: {
            orderBy: { position: 'asc' },
          },
        },
      });

      this.assertUserCanAccess(existing, user);

      if (dto.name === undefined && dto.tiles === undefined) {
        return this.serializeLayout(existing);
      }

      if (dto.name !== undefined || dto.tiles !== undefined) {
        await tx.buttonLayout.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.tiles !== undefined ? { updatedAt: new Date() } : {}),
          },
        });
      }

      if (dto.tiles !== undefined) {
        await tx.buttonLayoutTile.deleteMany({
          where: { buttonLayoutId: id },
        });

        if (dto.tiles.length > 0) {
          await tx.buttonLayoutTile.createMany({
            data: this.buildTileRows(id, dto.tiles),
          });
        }
      }

      const updated = await tx.buttonLayout.findUnique({
        where: { id },
        include: {
          tiles: {
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!updated) {
        throw new NotFoundException('Botonera no encontrada');
      }

      return this.serializeLayout(updated);
    });
  }

  async remove(id: string, user: AuthUser) {
    await this.findAccessibleLayout(id, user);

    return this.prisma.buttonLayout.delete({
      where: { id },
      select: { id: true },
    });
  }

  private async findAccessibleLayout(id: string, user: AuthUser) {
    const layout = await this.prisma.buttonLayout.findUnique({
      where: { id },
      include: {
        tiles: {
          orderBy: { position: 'asc' },
        },
      },
    });

    this.assertUserCanAccess(layout, user);
    return layout;
  }

  private assertUserCanAccess(
    layout: ButtonLayoutWithTiles | null,
    user: AuthUser,
  ): asserts layout is ButtonLayoutWithTiles {
    if (!layout) {
      throw new NotFoundException('Botonera no encontrada');
    }

    if (user.role !== Role.ADMIN && layout.userId !== user.id) {
      throw new ForbiddenException('No tenés acceso a esta botonera');
    }
  }

  private buildTileRows(buttonLayoutId: string, tiles: ButtonLayoutTileDto[]) {
    const usedIds = new Set<string>();

    return tiles.map((tile, index) => {
      const requestedId = tile.id?.trim();
      const id =
        requestedId && !usedIds.has(requestedId) ? requestedId : randomUUID();

      usedIds.add(id);

      return {
        id,
        buttonLayoutId,
        position: index,
        label: tile.label.trim(),
        colSpan: tile.colSpan,
        rowSpan: tile.rowSpan,
        tone: tile.tone.trim(),
      };
    });
  }

  private serializeLayout(layout: ButtonLayoutWithTiles) {
    return {
      id: layout.id,
      name: layout.name,
      createdAt: layout.createdAt,
      updatedAt: layout.updatedAt,
      tiles: [...layout.tiles]
        .sort((left, right) => left.position - right.position)
        .map((tile) => ({
          id: tile.id,
          label: tile.label,
          colSpan: tile.colSpan,
          rowSpan: tile.rowSpan,
          tone: tile.tone,
        })),
    };
  }
}
