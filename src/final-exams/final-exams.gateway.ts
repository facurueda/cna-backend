import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import { Subscription } from 'rxjs';
import { Server, Socket } from 'socket.io';
import { ExamActivityBus } from '../exams/exam-activity.bus';
import { PrismaService } from '../prisma/prisma.service';

const NAMESPACE = '/final-exams';
const roomOf = (catalogId: string) => `final-exam:${catalogId}`;

type JwtPayload = { sub?: string; pid?: string };

/**
 * Tiempo real para el detalle de un examen final del panel admin.
 * El cliente se conecta con `auth: { token }`, hace `subscribe` a un examen y
 * recibe `activity` cada vez que un arbitro lo inicia o lo termina. El evento no
 * lleva datos de negocio: el cliente vuelve a pedir `GET /final-exams/:id/referees`,
 * que sigue siendo la unica fuente de verdad.
 */
@WebSocketGateway({
  namespace: NAMESPACE,
  cors: {
    origin: [
      'https://www.cnavirtual.com.ar',
      'http://localhost:3000',
      'http://localhost:3001',
      'https://staging.cnavirtual.com.ar',
      'https://cnavirtual.com.ar',
    ],
    credentials: true,
  },
})
export class FinalExamsGateway
  implements OnGatewayConnection, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(FinalExamsGateway.name);
  private subscription?: Subscription;

  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly bus: ExamActivityBus,
  ) {}

  onModuleInit() {
    this.subscription = this.bus.events$.subscribe((event) => {
      if (event.kind === 'PROGRESS') {
        this.server?.to(roomOf(event.catalogId)).emit('progress', {
          catalogId: event.catalogId,
          userId: event.userId,
          examId: event.examId,
          ...event.progress,
        });
        return;
      }
      this.server?.to(roomOf(event.catalogId)).emit('activity', {
        catalogId: event.catalogId,
        userId: event.userId,
        examId: event.examId,
        kind: event.kind,
      });
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as { token?: unknown } | undefined;
      const token = auth?.token;
      if (typeof token !== 'string' || !token) throw new Error('missing token');

      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (!payload.sub) throw new Error('invalid payload');

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true },
      });
      if (!user) throw new Error('unknown user');

      // Mismo criterio que JwtStrategy: el rol efectivo es el de la membresia
      // del proyecto activo y, sin membresias, el rol global.
      const memberships = await this.prisma.projectMember.findMany({
        where: { userId: user.id, project: { isActive: true } },
        select: { projectId: true, role: true },
        orderBy: { createdAt: 'asc' },
      });
      const active = payload.pid
        ? memberships.find((m) => m.projectId === payload.pid)
        : memberships[0];
      if (payload.pid && !active) throw new Error('no project access');

      if ((active?.role ?? user.role) !== Role.ADMIN) {
        throw new Error('admin only');
      }
    } catch (error) {
      this.logger.debug(`Rejected socket ${client.id}: ${String(error)}`);
      client.emit('unauthorized');
      client.disconnect(true);
    }
  }

  @SubscribeMessage('subscribe')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { catalogId?: string },
  ) {
    if (typeof body?.catalogId !== 'string' || !body.catalogId) {
      return { ok: false };
    }
    await client.join(roomOf(body.catalogId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { catalogId?: string },
  ) {
    if (typeof body?.catalogId === 'string') {
      await client.leave(roomOf(body.catalogId));
    }
    return { ok: true };
  }
}
