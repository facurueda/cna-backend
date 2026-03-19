import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { ExamsService } from './exams.service';

@Controller('users/referees')
@UseGuards(JwtAuthGuard)
export class RefereeExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get(':userId/exams')
  findRefereeExams(@Param('userId') userId: string) {
    return this.examsService.findUserExams(userId);
  }
}
