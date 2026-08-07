import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Proyectos a los que el usuario pertenece, con su rol en cada uno. */
  async listForUser(userId: string) {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId, project: { isActive: true } },
      select: {
        role: true,
        project: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => ({
      id: membership.project.id,
      slug: membership.project.slug,
      name: membership.project.name,
      role: membership.role,
    }));
  }

  /**
   * Valida que el usuario pertenezca al proyecto. Es el unico punto que autoriza
   * un cambio de proyecto activo, asi que debe usarse siempre antes de emitir un token.
   */
  async assertMembership(userId: string, projectId: string) {
    const membership = await this.prisma.projectMember.findFirst({
      where: { userId, projectId, project: { isActive: true } },
      select: { projectId: true, role: true },
    });

    if (!membership) {
      throw new ForbiddenException('No pertenecés a este proyecto');
    }

    return membership;
  }

  /**
   * Afilia al usuario al proyecto por defecto (DEFAULT_PROJECT_SLUG, o el unico
   * proyecto activo si hay uno solo). Sin esto un usuario recien creado no podria
   * operar en ningun proyecto.
   */
  async ensureDefaultMembership(userId: string, role: Role) {
    const slug = process.env.DEFAULT_PROJECT_SLUG?.trim();

    const project = slug
      ? await this.prisma.project.findFirst({
          where: { slug, isActive: true },
          select: { id: true },
        })
      : await this.prisma.project.findFirst({
          where: { isActive: true },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });

    if (!project) return null;

    await this.prisma.projectMember.upsert({
      where: {
        projectId_userId: { projectId: project.id, userId },
      },
      create: { projectId: project.id, userId, role },
      update: {},
    });

    return project.id;
  }

  /** Proyecto por defecto al iniciar sesion: la membresia mas antigua. */
  async resolveDefaultProjectId(userId: string) {
    const membership = await this.prisma.projectMember.findFirst({
      where: { userId, project: { isActive: true } },
      select: { projectId: true },
      orderBy: { createdAt: 'asc' },
    });

    return membership?.projectId ?? null;
  }
}
