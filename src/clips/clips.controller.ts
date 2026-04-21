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
import { ClipVisibility, Role } from '@prisma/client';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { ClipsService } from './clips.service';
import { BatchCreateClipsDto } from './dto/batch-create-clips.dto';
import { CreateClipDto } from './dto/create-clip.dto';
import { ListClipsQueryDto } from './dto/list-clips.query.dto';
import { UpdateClipDto } from './dto/update-clip.dto';

type AuthUserPayload = { id: string; role: Role };

@Controller('clips')
@UseGuards(JwtAuthGuard)
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  list(@Query() query: ListClipsQueryDto, @AuthUser() user: AuthUserPayload) {
    return this.clipsService.list(query, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateClipDto, @AuthUser() user: AuthUserPayload) {
    return this.clipsService.create(dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('batch')
  createBatch(
    @Body() dto: BatchCreateClipsDto,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.createBatch(dto, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.clipsService.getById(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClipDto,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.update(id, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.clipsService.remove(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/publish')
  publish(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.clipsService.setVisibility(id, ClipVisibility.PUBLIC, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/unpublish')
  unpublish(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.clipsService.setVisibility(id, ClipVisibility.PRIVATE, user);
  }
}
