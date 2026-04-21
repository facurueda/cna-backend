import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { CreateFinalExamCatalogDto } from './dto/create-final-exam-catalog.dto';
import { FinalExamsService } from './final-exams.service';

type AuthUserPayload = {
  id: string;
  role: Role;
};

@Controller('final-exams')
@UseGuards(JwtAuthGuard)
export class FinalExamsController {
  constructor(private readonly finalExamsService: FinalExamsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  createCatalog(
    @AuthUser() user: AuthUserPayload,
    @Body() dto: CreateFinalExamCatalogDto,
  ) {
    return this.finalExamsService.createCatalog(user, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/publish')
  publishCatalog(@Param('id') id: string) {
    return this.finalExamsService.publishCatalog(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get()
  listAllCatalogs() {
    return this.finalExamsService.listAllCatalogs();
  }

  @Get('my')
  listMyCatalogs(@AuthUser() user: AuthUserPayload) {
    return this.finalExamsService.listMyCatalogs(user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':id/referees')
  listCatalogReferees(@Param('id') id: string) {
    return this.finalExamsService.listCatalogReferees(id);
  }

  @Post(':id/start')
  startAttempt(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.finalExamsService.startAttempt(id, user);
  }
}
