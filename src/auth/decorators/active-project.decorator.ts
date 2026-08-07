import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth-user.types';

/**
 * Proyecto activo de la sesion. Falla explicitamente si no hay uno, para que
 * ningun handler tenant-scoped pueda ejecutarse sin saber a que proyecto pertenece.
 */
export const ActiveProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{
      user?: Pick<AuthenticatedUser, 'projectId'>;
    }>();

    const projectId = request.user?.projectId;
    if (!projectId) {
      throw new ForbiddenException('No hay un proyecto activo en la sesion');
    }

    return projectId;
  },
);
