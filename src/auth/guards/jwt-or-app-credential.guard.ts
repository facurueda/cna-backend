import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import {
  APP_CREDENTIAL_SCOPES_KEY,
  AppCredentialScope,
} from '../app-credentials.constants';
import { AppCredentialsService } from '../app-credentials.service';
import { AuthenticatedUser } from '../auth-user.types';

type JwtPayload = {
  sub?: string;
  /** Proyecto activo. Ausente en tokens emitidos antes de multi-proyecto. */
  pid?: string;
};

@Injectable()
export class JwtOrAppCredentialGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly appCredentials: AppCredentialsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const jwtUser = await this.tryJwtAuthentication(token);
    if (jwtUser) {
      request.user = jwtUser;
      return true;
    }

    const requiredScopes =
      this.reflector.getAllAndOverride<AppCredentialScope[]>(
        APP_CREDENTIAL_SCOPES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (requiredScopes.length === 0) {
      throw new UnauthorizedException(
        'App credential access is not enabled for this endpoint',
      );
    }

    request.user = await this.appCredentials.validateToken(
      token,
      requiredScopes,
    );

    return true;
  }

  private async tryJwtAuthentication(
    token: string,
  ): Promise<AuthenticatedUser | null> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (!payload.sub) {
        return null;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          requiresPasswordChange: true,
        },
      });

      if (!user) {
        return null;
      }

      const memberships = await this.prisma.projectMember.findMany({
        where: { userId: user.id, project: { isActive: true } },
        select: { projectId: true, role: true },
        orderBy: { createdAt: 'asc' },
      });

      const active = payload.pid
        ? memberships.find((membership) => membership.projectId === payload.pid)
        : memberships[0];

      if (payload.pid && !active) {
        return null;
      }

      return {
        ...user,
        projectId: active?.projectId ?? null,
        role: active?.role ?? user.role,
        authType: 'jwt',
      };
    } catch {
      return null;
    }
  }
}
