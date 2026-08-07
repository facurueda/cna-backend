import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BulkCreateClipCategoryDto } from './dto/bulk-create-clip-category.dto';
import { CreateClipCategoryDto } from './dto/create-clip-category.dto';
import { UpdateClipCategoryDto } from './dto/update-clip-category.dto';

@Injectable()
export class ClipCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string) {
    return this.prisma.clipCategory.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async bulkCreate(projectId: string, dto: BulkCreateClipCategoryDto) {
    const names = dto.categories.map((category) => category.name.trim());

    await this.prisma.clipCategory.createMany({
      data: names.map((name) => ({ name, projectId })),
      skipDuplicates: true,
    });

    return this.prisma.clipCategory.findMany({
      where: { projectId, name: { in: names } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async create(projectId: string, dto: CreateClipCategoryDto) {
    return this.prisma.clipCategory.create({
      data: { name: dto.name.trim(), projectId },
      select: { id: true, name: true },
    });
  }

  async update(projectId: string, id: string, dto: UpdateClipCategoryDto) {
    await this.assertExists(projectId, id);

    return this.prisma.clipCategory.update({
      where: { id },
      data: { name: dto.name?.trim() },
      select: { id: true, name: true },
    });
  }

  async remove(projectId: string, id: string) {
    await this.assertExists(projectId, id);

    const clipsCount = await this.prisma.clip.count({
      where: { categoryId: id },
    });

    if (clipsCount > 0) {
      throw new BadRequestException(
        'No se puede borrar una categoría con clips asociados',
      );
    }

    await this.prisma.clipCategory.delete({ where: { id } });
    return { ok: true };
  }

  /** Busca siempre acotando por proyecto: una categoria de otro proyecto es un 404. */
  private async assertExists(projectId: string, id: string) {
    const category = await this.prisma.clipCategory.findFirst({
      where: { id, projectId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
  }
}
