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
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { Roles } from '../auth/roles/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles/roles.guard';
import { AuthUser } from 'src/auth/decorators/auth-user.decorator';

type JwtUser = {
  id: string;
  role: string;
  email: string;
  firstName: string;
  lastName: string;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  // Admin crea partido
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateMatchDto) {
    return this.matchesService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  myMatches(@AuthUser() user: JwtUser) {
    return this.matchesService.findMyMatches(user.id);
  }

  // Listado por competencia (para user/admin)
  @Get()
  findAll(@Query('competitionId') competitionId?: string) {
    if (!competitionId) return [];
    return this.matchesService.findAllByCompetition(competitionId);
  }

  // Detalle partido (para user/admin)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  // Admin edita partido (no status)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(id, dto);
  }

  // Admin close/open
  @Roles(Role.ADMIN)
  @Post(':id/close')
  close(@Param('id') id: string) {
    return this.matchesService.close(id);
  }

  @Roles(Role.ADMIN)
  @Post(':id/open')
  open(@Param('id') id: string) {
    return this.matchesService.open(id);
  }

  // Admin set referees (reemplazo total)
  @Roles(Role.ADMIN)
  @Post(':id/referees')
  setReferees(@Param('id') id: string, @Body() body: { refereeIds: string[] }) {
    return this.matchesService.setReferees(id, body.refereeIds ?? []);
  }

  // Admin delete
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.matchesService.remove(id);
  }
}
