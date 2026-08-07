import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

type JwtPayload = {
  sub: string;
  role?: string;
  email?: string;
  /** Proyecto activo. Los tokens emitidos antes de multi-proyecto no lo traen. */
  pid?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('Missing JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const userId = payload.sub;
    if (!userId) throw new UnauthorizedException('Invalid token payload');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        requiresPasswordChange: true,
      },
    });

    if (!user) throw new UnauthorizedException('Invalid token');

    const memberships = await this.prisma.projectMember.findMany({
      where: { userId: user.id, project: { isActive: true } },
      select: { projectId: true, role: true },
      orderBy: { createdAt: 'asc' },
    });

    // Con `pid` el proyecto debe existir entre las membresias del usuario. Sin `pid`
    // (tokens viejos) se cae a la primera, para no invalidar sesiones ya emitidas.
    const active = payload.pid
      ? memberships.find((membership) => membership.projectId === payload.pid)
      : memberships[0];

    if (payload.pid && !active) {
      throw new UnauthorizedException('Sin acceso al proyecto solicitado');
    }

    return {
      ...user,
      projectId: active?.projectId ?? null,
      // El rol efectivo es el de la membresia: se puede ser ADMIN en un proyecto
      // y GENERAL en otro. Sin membresias se conserva el rol global.
      role: active?.role ?? user.role,
    };
  }
}
