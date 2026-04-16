import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { ClipCollectionsService } from './clip-collections.service';
import { CreateClipCollectionDto } from './dto/create-clip-collection.dto';
import { ListClipCollectionsQueryDto } from './dto/list-clip-collections.query.dto';
import { UpdateClipCollectionDto } from './dto/update-clip-collection.dto';

type AuthUserPayload = { id: string; role: Role };

@Controller('clip-collections')
@UseGuards(JwtAuthGuard)
export class ClipCollectionsController {
  constructor(private readonly collections: ClipCollectionsService) {}

  @Get()
  list(
    @Query() query: ListClipCollectionsQueryDto,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.collections.list(user, query.includeCounts);
  }

  @Get(':id')
  get(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.collections.getById(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateClipCollectionDto) {
    return this.collections.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateClipCollectionDto) {
    return this.collections.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.collections.remove(id);
  }
}
