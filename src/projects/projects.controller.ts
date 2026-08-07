import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import type { AuthenticatedUser } from '../auth/auth-user.types';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('me')
  async listMine(@AuthUser() user: AuthenticatedUser) {
    return {
      activeProjectId: user.projectId,
      projects: await this.projects.listForUser(user.id),
    };
  }
}
