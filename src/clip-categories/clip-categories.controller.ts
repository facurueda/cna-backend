import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { ClipCategoriesService } from './clip-categories.service';
import { BulkCreateClipCategoryDto } from './dto/bulk-create-clip-category.dto';
import { CreateClipCategoryDto } from './dto/create-clip-category.dto';
import { UpdateClipCategoryDto } from './dto/update-clip-category.dto';

@Controller('clip-categories')
@UseGuards(JwtAuthGuard)
export class ClipCategoriesController {
  constructor(private readonly categories: ClipCategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('bulk')
  bulkCreate(@Body() dto: BulkCreateClipCategoryDto) {
    return this.categories.bulkCreate(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateClipCategoryDto) {
    return this.categories.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClipCategoryDto) {
    return this.categories.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
