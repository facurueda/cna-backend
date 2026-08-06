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
import { CreateRegulationPhraseDto } from './dto/create-regulation-phrase.dto';
import { UpdateRegulationPhraseDto } from './dto/update-regulation-phrase.dto';
import { RegulationPhrasesService } from './regulation-phrases.service';

@Controller('regulation-phrases')
@UseGuards(JwtAuthGuard)
export class RegulationPhrasesController {
  constructor(
    private readonly regulationPhrasesService: RegulationPhrasesService,
  ) {}

  @Get()
  findAll() {
    return this.regulationPhrasesService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateRegulationPhraseDto) {
    return this.regulationPhrasesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateRegulationPhraseDto) {
    return this.regulationPhrasesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.regulationPhrasesService.remove(id);
  }
}
