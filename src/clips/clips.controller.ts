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
import { ActiveProject } from '../auth/decorators/active-project.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { ClipsService } from './clips.service';
import { CreateClipDto } from './dto/create-clip.dto';
import { ListClipsQueryDto } from './dto/list-clips.query.dto';
import { UpdateClipDto } from './dto/update-clip.dto';

type AuthUserPayload = { id: string; role: Role };

@Controller('clips')
@UseGuards(JwtAuthGuard)
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  list(
    @ActiveProject() projectId: string,
    @Query() query: ListClipsQueryDto,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.list(projectId, query, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(
    @ActiveProject() projectId: string,
    @Body() dto: CreateClipDto,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.create(projectId, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/uploaded')
  markUploaded(
    @ActiveProject() projectId: string,
    @Param('id') id: string,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.markUploaded(projectId, id, user);
  }

  @Get(':id')
  get(
    @ActiveProject() projectId: string,
    @Param('id') id: string,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.getById(projectId, id, user);
  }

  @Get(':id/playback')
  playback(
    @ActiveProject() projectId: string,
    @Param('id') id: string,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.getPlaybackUrl(projectId, id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @ActiveProject() projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateClipDto,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.update(projectId, id, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(
    @ActiveProject() projectId: string,
    @Param('id') id: string,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.remove(projectId, id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/publish')
  publish(
    @ActiveProject() projectId: string,
    @Param('id') id: string,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.setVisibility(
      projectId,
      id,
      ClipVisibility.PUBLIC,
      user,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/unpublish')
  unpublish(
    @ActiveProject() projectId: string,
    @Param('id') id: string,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.clipsService.setVisibility(
      projectId,
      id,
      ClipVisibility.PRIVATE,
      user,
    );
  }
}
