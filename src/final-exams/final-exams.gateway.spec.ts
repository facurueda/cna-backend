import { INestApplication } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import { ExamActivityBus } from '../exams/exam-activity.bus';
import { PrismaService } from '../prisma/prisma.service';
import { FinalExamsGateway } from './final-exams.gateway';

describe('FinalExamsGateway', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let bus: ExamActivityBus;
  let url: string;
  const sockets: Socket[] = [];
  const prisma = {
    user: { findUnique: jest.fn() },
    projectMember: { findMany: jest.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        FinalExamsGateway,
        ExamActivityBus,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    url = `${await app.getUrl()}/final-exams`.replace('[::1]', 'localhost');
    jwt = moduleRef.get(JwtService);
    bus = moduleRef.get(ExamActivityBus);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  beforeEach(() => {
    prisma.projectMember.findMany.mockResolvedValue([]);
  });

  const connect = (token: string) => {
    const socket = io(url, { transports: ['websocket'], auth: { token } });
    sockets.push(socket);
    return socket;
  };

  it('envia la actividad del examen suscripto a un admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'a1', role: 'ADMIN' });
    const socket = connect(await jwt.signAsync({ sub: 'a1' }));
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const ack = (await socket.emitWithAck('subscribe', {
      catalogId: 'c1',
    })) as { ok: boolean };
    expect(ack).toEqual({ ok: true });

    const received = new Promise((resolve) => socket.on('activity', resolve));
    bus.publish({
      catalogId: 'other',
      userId: 'u0',
      examId: 'e0',
      kind: 'STARTED',
    });
    bus.publish({
      catalogId: 'c1',
      userId: 'u1',
      examId: 'e1',
      kind: 'FINISHED',
    });

    await expect(received).resolves.toEqual({
      catalogId: 'c1',
      userId: 'u1',
      kind: 'FINISHED',
    });
  });

  it('rechaza a quien no es admin', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'GENERAL' });
    const socket = connect(await jwt.signAsync({ sub: 'u1' }));
    const unauthorized = new Promise<void>((resolve) =>
      socket.on('unauthorized', () => resolve()),
    );
    const disconnected = new Promise<void>((resolve) =>
      socket.on('disconnect', () => resolve()),
    );
    await Promise.all([unauthorized, disconnected]);
    expect(socket.connected).toBe(false);
  });

  it('rechaza un token invalido', async () => {
    const socket = connect('basura');
    await new Promise<void>((resolve) =>
      socket.on('unauthorized', () => resolve()),
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'basura' } }),
    );
  });
});
