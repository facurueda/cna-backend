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
import { ClipsService } from './clips.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateClipDto } from './dto/create-clip.dto';
import { UpdateClipDto } from './dto/update-clip.dto';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { AuthUser } from 'src/auth/decorators/auth-user.decorator';
import { Role } from '@prisma/client';
import { CreateClipBatchDto } from './dto/create-clip-batch.dto';

type JwtUser = { id: string; role: string };

@Controller('clips')
@UseGuards(JwtAuthGuard)
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my')
  myClips(
    @AuthUser() user: JwtUser,
    @Query('scope') scope?: 'created' | 'as_referee' | 'all',
  ) {
    return this.clipsService.findMyClips(user.id, scope ?? 'created');
  }

  @Post()
  create(@Body() dto: CreateClipDto, @AuthUser() user: any) {
    return this.clipsService.create(dto, user);
  }

  @Get()
  list(@Query('matchId') matchId: string, @AuthUser() user: any) {
    return this.clipsService.listByMatch(matchId, user);
  }

  @Post('batch')
  createBatch(@Body() dto: CreateClipBatchDto, @AuthUser() user: any) {
    return this.clipsService.createBatch(dto, user);
  }

  @Get('match/:matchId')
  listByMatchParam(@Param('matchId') matchId: string, @AuthUser() user: any) {
    return this.clipsService.listByMatch(matchId, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @AuthUser() user: any) {
    return this.clipsService.getById(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClipDto,
    @AuthUser() user: any,
  ) {
    return this.clipsService.update(id, dto, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @AuthUser() user: any) {
    return this.clipsService.remove(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/close')
  close(@Param('id') id: string, @AuthUser() user: any) {
    return this.clipsService.close(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/open')
  open(@Param('id') id: string, @AuthUser() user: any) {
    return this.clipsService.open(id, user);
  }
}
