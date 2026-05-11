import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ExamStatus, ExamType, Role } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/roles/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatsService } from '../users/user-stats.service';
import { ExamsService } from './exams.service';
import { RefereeExamsController } from './referee-exams.controller';

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
  };
  exam: {
    findMany: jest.Mock;
  };
};

const mockAuthGuard: CanActivate = {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['x-user-id'];
    if (!userId || Array.isArray(userId)) {
      throw new UnauthorizedException('Missing auth header');
    }

    const roleHeader = req.headers['x-user-role'];
    req.user = {
      id: userId,
      role:
        !Array.isArray(roleHeader) && roleHeader === Role.ADMIN
          ? Role.ADMIN
          : Role.GENERAL,
    };

    return true;
  },
};

const mockAdminGuard: CanActivate = {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    return req.user?.role === Role.ADMIN;
  },
};

describe('RefereeExamsController', () => {
  let app: INestApplication<App>;
  let prisma: PrismaMock;

  beforeAll(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      exam: {
        findMany: jest.fn(),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RefereeExamsController],
      providers: [
        ExamsService,
        {
          provide: UserStatsService,
          useValue: {
            registerFinishedExam: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockAdminGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when request is not authenticated', async () => {
    await request(app.getHttpServer())
      .get('/users/referees/ref-1/exams')
      .expect(401);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.exam.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', async () => {
    await request(app.getHttpServer())
      .get('/users/referees/ref-1/exams')
      .set('x-user-id', 'user-1')
      .expect(403);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.exam.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when referee does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/users/referees/missing/exams')
      .set('x-user-id', 'admin-1')
      .set('x-user-role', Role.ADMIN)
      .expect(404);

    expect(prisma.exam.findMany).not.toHaveBeenCalled();
  });

  it('returns 200 with an empty array when referee has no exams', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'ref-1' });
    prisma.exam.findMany.mockResolvedValue([]);

    const response = await request(app.getHttpServer())
      .get('/users/referees/ref-1/exams')
      .set('x-user-id', 'admin-1')
      .set('x-user-role', Role.ADMIN)
      .expect(200);

    expect(response.body).toEqual([]);
    expect(prisma.exam.findMany).toHaveBeenCalledWith({
      where: { userId: 'ref-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        userId: true,
        finalExamCatalogId: true,
        attemptNumber: true,
        questionCount: true,
        isTimed: true,
        totalTimeSeconds: true,
        status: true,
        examType: true,
        passThresholdPercent: true,
        correctCount: true,
        wrongCount: true,
        scorePercent: true,
        isPassed: true,
        createdAt: true,
        finishedAt: true,
        finalExamCatalog: {
          select: {
            title: true,
          },
        },
      },
    });
  });

  it('returns the same exam list shape used by GET /exams/my for the requested referee', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'ref-9' });
    prisma.exam.findMany.mockResolvedValue([
      {
        id: 'attempt-123',
        userId: 'ref-9',
        finalExamCatalogId: 'catalog-9',
        attemptNumber: 2,
        questionCount: 20,
        isTimed: true,
        totalTimeSeconds: 1500,
        status: ExamStatus.FINISHED,
        examType: ExamType.FINAL,
        passThresholdPercent: 80,
        correctCount: 17,
        wrongCount: 3,
        scorePercent: 85,
        isPassed: true,
        createdAt: new Date('2026-03-10T18:00:00.000Z'),
        finishedAt: new Date('2026-03-10T18:25:00.000Z'),
        finalExamCatalog: {
          title: 'Reglamento FIFA 2024',
        },
      },
      {
        id: 'attempt-124',
        userId: 'ref-9',
        finalExamCatalogId: null,
        attemptNumber: null,
        questionCount: 15,
        isTimed: false,
        totalTimeSeconds: null,
        status: ExamStatus.FINISHED,
        examType: ExamType.PRACTICE,
        passThresholdPercent: 80,
        correctCount: 9,
        wrongCount: 6,
        scorePercent: 60,
        isPassed: false,
        createdAt: new Date('2026-02-20T19:00:00.000Z'),
        finishedAt: new Date('2026-02-20T19:18:00.000Z'),
        finalExamCatalog: null,
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/users/referees/ref-9/exams')
      .set('x-user-id', 'admin-1')
      .set('x-user-role', Role.ADMIN)
      .expect(200);

    expect(response.body).toEqual([
      {
        id: 'attempt-123',
        userId: 'ref-9',
        finalExamCatalogId: 'catalog-9',
        attemptNumber: 2,
        questionCount: 20,
        isTimed: true,
        totalTimeSeconds: 1500,
        status: 'FINISHED',
        examType: 'FINAL',
        passThresholdPercent: 80,
        correctCount: 17,
        wrongCount: 3,
        scorePercent: 85,
        isPassed: true,
        createdAt: '2026-03-10T18:00:00.000Z',
        finishedAt: '2026-03-10T18:25:00.000Z',
        title: 'Reglamento FIFA 2024',
      },
      {
        id: 'attempt-124',
        userId: 'ref-9',
        finalExamCatalogId: null,
        attemptNumber: null,
        questionCount: 15,
        isTimed: false,
        totalTimeSeconds: null,
        status: 'FINISHED',
        examType: 'PRACTICE',
        passThresholdPercent: 80,
        correctCount: 9,
        wrongCount: 6,
        scorePercent: 60,
        isPassed: false,
        createdAt: '2026-02-20T19:00:00.000Z',
        finishedAt: '2026-02-20T19:18:00.000Z',
        title: null,
      },
    ]);
  });
});
