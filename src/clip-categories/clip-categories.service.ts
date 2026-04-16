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

  async list() {
    return this.prisma.clipCategory.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async bulkCreate(dto: BulkCreateClipCategoryDto) {
    const data = dto.categories.map((c) => ({ name: c.name.trim() }));

    await this.prisma.clipCategory.createMany({
      data,
      skipDuplicates: true,
    });

    return this.prisma.clipCategory.findMany({
      where: { name: { in: data.map((c) => c.name) } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async create(dto: CreateClipCategoryDto) {
    return this.prisma.clipCategory.create({
      data: { name: dto.name.trim() },
      select: { id: true, name: true },
    });
  }

  async update(id: string, dto: UpdateClipCategoryDto) {
    await this.assertExists(id);

    return this.prisma.clipCategory.update({
      where: { id },
      data: { name: dto.name?.trim() },
      select: { id: true, name: true },
    });
  }

  async remove(id: string) {
    await this.assertExists(id);

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

  private async assertExists(id: string) {
    const category = await this.prisma.clipCategory.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
  }
}
