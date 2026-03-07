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
import { CompetitionsService } from './competitions.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { SetCompetitionRefereesDto } from './dto/set-competition-referees.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles/roles.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { Role } from '@prisma/client';
import { AuthUser } from 'src/auth/decorators/auth-user.decorator';

@Controller('competitions')
@UseGuards(JwtAuthGuard)
export class CompetitionsController {
  constructor(private readonly service: CompetitionsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my')
  myCompetitions(@AuthUser() user: { id: string; role: Role }) {
    return this.service.findMyCompetitions(user);
  }

  // GENERAL + ADMIN
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // GENERAL + ADMIN
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // ADMIN
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateCompetitionDto) {
    return this.service.create(dto);
  }

  // ADMIN
  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateCompetitionDto) {
    return this.service.update(id, dto);
  }

  // ADMIN
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ADMIN: asignar referees a competencia (vínculo organizacional)
  @Post(':id/referees')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  setReferees(
    @Param('id') id: string,
    @Body() dto: SetCompetitionRefereesDto,
  ) {
    return this.service.setReferees(id, dto.refereeIds ?? []);
  }

  // ADMIN: quitar referee de competencia
  @Delete(':id/referees/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  removeReferee(@Param('id') id: string, @Param('userId') userId: string) {
    return this.service.removeReferee(id, userId);
  }

  // Lista de referees asignados a la competencia
  @Get(':id/referees')
  @UseGuards(JwtAuthGuard)
  referees(@Param('id') id: string) {
    return this.service.listReferees(id);
  }
}
