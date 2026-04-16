import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ExamStatus, FinalExamCatalogStatus, Role } from '@prisma/client';
import { ExamsService } from '../exams/exams.service';
import { FinalExamsService } from './final-exams.service';

describe('FinalExamsService', () => {
  const prisma = {
    category: { findMany: jest.fn() },
    competition: { findMany: jest.fn() },
    competitionReferee: { findFirst: jest.fn(), findMany: jest.fn() },
    finalExamCatalog: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    exam: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  };

  const examsService = {
    findOne: jest.fn(),
    createGeneratedExam: jest.fn(),
  };

  let service: FinalExamsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinalExamsService(prisma as never, examsService as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses "Examen" as default title when title is missing', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Reglamento' },
    ]);
    prisma.competition.findMany.mockResolvedValue([
      { id: 'comp-1', name: 'Torneo' },
    ]);
    const createdAt = new Date('2026-03-03T12:00:00.000Z');
    prisma.finalExamCatalog.create.mockResolvedValue({
      id: 'catalog-1',
      title: 'Examen',
      status: FinalExamCatalogStatus.DRAFT,
      questionCount: 10,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: null,
      maxRetries: 0,
      shuffleOptions: true,
      passThresholdPercent: 70,
      publishedAt: null,
      createdAt,
      categories: [{ category: { id: 'cat-1', name: 'Reglamento' } }],
      competitions: [{ competition: { id: 'comp-1', name: 'Torneo' } }],
    });

    const result = await service.createCatalog(
      { id: 'admin-1', role: Role.ADMIN },
      {
        questionCount: 10,
        categoryIds: ['cat-1'],
        competitionIds: ['comp-1'],
        isTimed: false,
      },
    );

    expect(prisma.finalExamCatalog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Examen',
        }),
      }),
    );
    expect(result.title).toBe('Examen');
  });

  it('trims title when provided', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'cat-1', name: 'Reglamento' },
    ]);
    prisma.competition.findMany.mockResolvedValue([
      { id: 'comp-1', name: 'Torneo' },
    ]);
    const createdAt = new Date('2026-03-03T12:00:00.000Z');
    prisma.finalExamCatalog.create.mockResolvedValue({
      id: 'catalog-1',
      title: 'Final marzo',
      status: FinalExamCatalogStatus.DRAFT,
      questionCount: 10,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: null,
      maxRetries: 0,
      shuffleOptions: true,
      passThresholdPercent: 70,
      publishedAt: null,
      createdAt,
      categories: [{ category: { id: 'cat-1', name: 'Reglamento' } }],
      competitions: [{ competition: { id: 'comp-1', name: 'Torneo' } }],
    });

    await service.createCatalog(
      { id: 'admin-1', role: Role.ADMIN },
      {
        title: '  Final marzo  ',
        questionCount: 10,
        categoryIds: ['cat-1'],
        competitionIds: ['comp-1'],
        isTimed: false,
      },
    );

    expect(prisma.finalExamCatalog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Final marzo',
        }),
      }),
    );
  });

  it('lists only assigned published catalogs for admins in my catalogs', async () => {
    const createdAt = new Date('2026-03-03T12:00:00.000Z');
    prisma.finalExamCatalog.findMany.mockResolvedValue([
      {
        id: 'catalog-1',
        title: 'Final marzo',
        status: FinalExamCatalogStatus.PUBLISHED,
        questionCount: 10,
        isTimed: false,
        totalTimeSeconds: null,
        availableUntilDate: null,
        maxRetries: 1,
        shuffleOptions: true,
        passThresholdPercent: 70,
        publishedAt: createdAt,
        createdAt,
        categories: [{ category: { id: 'cat-1', name: 'Reglamento' } }],
        competitions: [{ competition: { id: 'comp-1', name: 'Inicial' } }],
        exams: [],
      },
    ]);

    const result = await service.listMyCatalogs({
      id: 'admin-1',
      role: Role.ADMIN,
    });

    expect(prisma.finalExamCatalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: FinalExamCatalogStatus.PUBLISHED,
          competitions: {
            some: {
              competition: {
                referees: {
                  some: { userId: 'admin-1' },
                },
              },
            },
          },
        },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'catalog-1',
        title: 'Final marzo',
      }),
    ]);
  });

  it('does not list non assigned catalogs for admins in my catalogs', async () => {
    prisma.finalExamCatalog.findMany.mockResolvedValue([]);

    const result = await service.listMyCatalogs({
      id: 'admin-1',
      role: Role.ADMIN,
    });

    expect(result).toEqual([]);
  });

  it('returns existing pending attempt when present', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 10,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: null,
      maxRetries: 2,
      passThresholdPercent: 70,
      categories: [{ categoryId: 'cat-1' }],
      competitions: [{ competitionId: 'comp-1' }],
    });
    prisma.competitionReferee.findFirst.mockResolvedValue({
      competitionId: 'comp-1',
    });
    prisma.exam.findFirst.mockResolvedValueOnce({ id: 'pending-exam' });
    examsService.findOne.mockResolvedValue({ id: 'pending-exam' });

    const result = await service.startAttempt('catalog-1', {
      id: 'user-1',
      role: Role.GENERAL,
    });

    expect(result).toEqual({ id: 'pending-exam' });
    expect(examsService.createGeneratedExam).not.toHaveBeenCalled();
  });

  it('throws conflict when user already passed final catalog', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 10,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: null,
      maxRetries: 2,
      passThresholdPercent: 70,
      categories: [{ categoryId: 'cat-1' }],
      competitions: [{ competitionId: 'comp-1' }],
    });
    prisma.competitionReferee.findFirst.mockResolvedValue({
      competitionId: 'comp-1',
    });
    prisma.exam.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'finished-pass' });

    await expect(
      service.startAttempt('catalog-1', { id: 'user-1', role: Role.GENERAL }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws conflict when attempts are exhausted', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 10,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: null,
      maxRetries: 1,
      passThresholdPercent: 70,
      categories: [{ categoryId: 'cat-1' }],
      competitions: [{ competitionId: 'comp-1' }],
    });
    prisma.competitionReferee.findFirst.mockResolvedValue({
      competitionId: 'comp-1',
    });
    prisma.exam.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.exam.count.mockResolvedValue(2);

    await expect(
      service.startAttempt('catalog-1', { id: 'user-1', role: Role.GENERAL }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a new attempt when user is eligible and has attempts left', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 20,
      isTimed: true,
      totalTimeSeconds: 1200,
      availableUntilDate: null,
      maxRetries: 2,
      shuffleOptions: true,
      passThresholdPercent: 75,
      categories: [{ categoryId: 'cat-1' }, { categoryId: 'cat-2' }],
      competitions: [{ competitionId: 'comp-1' }],
    });
    prisma.competitionReferee.findFirst.mockResolvedValue({
      competitionId: 'comp-1',
    });
    prisma.exam.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.exam.count.mockResolvedValue(1);
    examsService.createGeneratedExam.mockResolvedValue({ id: 'new-exam' });

    const result = await service.startAttempt('catalog-1', {
      id: 'user-1',
      role: Role.GENERAL,
    });

    expect(result).toEqual({ id: 'new-exam' });
    expect(examsService.createGeneratedExam).toHaveBeenCalledWith(
      { id: 'user-1', role: Role.GENERAL },
      {
        examType: 'FINAL',
        questionCount: 20,
        categoryIds: ['cat-1', 'cat-2'],
        isTimed: true,
        totalTimeSeconds: 1200,
        shuffleOptions: true,
        passThresholdPercent: 75,
        finalExamCatalogId: 'catalog-1',
        attemptNumber: 2,
      },
    );
  });

  it('creates a new attempt when assigned admin is eligible and has attempts left', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 20,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: null,
      maxRetries: 2,
      shuffleOptions: false,
      passThresholdPercent: 75,
      categories: [{ categoryId: 'cat-1' }],
      competitions: [{ competitionId: 'comp-1' }],
    });
    prisma.competitionReferee.findFirst.mockResolvedValue({
      competitionId: 'comp-1',
    });
    prisma.exam.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.exam.count.mockResolvedValue(0);
    examsService.createGeneratedExam.mockResolvedValue({ id: 'admin-exam' });

    const result = await service.startAttempt('catalog-1', {
      id: 'admin-1',
      role: Role.ADMIN,
    });

    expect(result).toEqual({ id: 'admin-exam' });
    expect(examsService.createGeneratedExam).toHaveBeenCalledWith(
      { id: 'admin-1', role: Role.ADMIN },
      expect.objectContaining({
        examType: 'FINAL',
        finalExamCatalogId: 'catalog-1',
        attemptNumber: 1,
        shuffleOptions: false,
      }),
    );
  });

  it('throws forbidden for non assigned referee', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 10,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: null,
      maxRetries: 1,
      passThresholdPercent: 70,
      categories: [{ categoryId: 'cat-1' }],
      competitions: [{ competitionId: 'comp-1' }],
    });
    prisma.competitionReferee.findFirst.mockResolvedValue(null);

    await expect(
      service.startAttempt('catalog-1', { id: 'user-1', role: Role.GENERAL }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws forbidden for non assigned admin', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 10,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: null,
      maxRetries: 1,
      passThresholdPercent: 70,
      categories: [{ categoryId: 'cat-1' }],
      competitions: [{ competitionId: 'comp-1' }],
    });
    prisma.competitionReferee.findFirst.mockResolvedValue(null);

    await expect(
      service.startAttempt('catalog-1', { id: 'admin-1', role: Role.ADMIN }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws not found for missing catalog', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue(null);

    await expect(
      service.startAttempt('missing', { id: 'user-1', role: Role.GENERAL }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws conflict when final catalog is closed by availableUntilDate', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-16T03:00:00.000Z'));
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 10,
      isTimed: false,
      totalTimeSeconds: null,
      availableUntilDate: '2026-03-15',
      maxRetries: 2,
      passThresholdPercent: 70,
      categories: [{ categoryId: 'cat-1' }],
      competitions: [{ competitionId: 'comp-1' }],
    });
    prisma.competitionReferee.findFirst.mockResolvedValue({
      competitionId: 'comp-1',
    });

    await expect(
      service.startAttempt('catalog-1', { id: 'user-1', role: Role.GENERAL }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists linked referees with their final exam progress', async () => {
    const createdAt = new Date('2026-02-12T10:00:00.000Z');
    const finishedAt = new Date('2026-03-03T10:00:00.000Z');
    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      title: 'Final febrero',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 20,
      availableUntilDate: null,
      maxRetries: 2,
      createdAt,
      competitions: [
        {
          competitionId: 'comp-1',
          competition: { id: 'comp-1', name: 'Liga Prof.' },
        },
        {
          competitionId: 'comp-2',
          competition: { id: 'comp-2', name: 'Liga Nacional' },
        },
      ],
    });
    prisma.competitionReferee.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        user: {
          id: 'user-1',
          firstName: 'Juan',
          lastName: 'González',
          email: 'juan@example.com',
        },
      },
      {
        userId: 'user-2',
        user: {
          id: 'user-2',
          firstName: 'María',
          lastName: 'Rodríguez',
          email: 'maria@example.com',
        },
      },
      {
        userId: 'admin-1',
        user: {
          id: 'admin-1',
          firstName: 'Ana',
          lastName: 'Admin',
          email: 'admin@example.com',
        },
      },
      {
        userId: 'user-1',
        user: {
          id: 'user-1',
          firstName: 'Juan',
          lastName: 'González',
          email: 'juan@example.com',
        },
      },
    ]);
    prisma.exam.findMany.mockResolvedValue([
      {
        id: 'exam-2',
        userId: 'user-2',
        status: ExamStatus.PENDING,
        isPassed: null,
        scorePercent: null,
        attemptNumber: 1,
        createdAt: new Date('2026-03-04T10:00:00.000Z'),
        finishedAt: null,
      },
      {
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.FINISHED,
        isPassed: true,
        scorePercent: 80,
        attemptNumber: 1,
        createdAt: finishedAt,
        finishedAt,
      },
    ]);

    const result = await service.listCatalogReferees('catalog-1');

    expect(result).toEqual({
      id: 'catalog-1',
      title: 'Final febrero',
      status: FinalExamCatalogStatus.PUBLISHED,
      createdAt,
      questionCount: 20,
      availableUntilDate: null,
      isClosed: false,
      maxRetries: 2,
      maxAttempts: 2,
      competitions: [
        { id: 'comp-1', name: 'Liga Prof.' },
        { id: 'comp-2', name: 'Liga Nacional' },
      ],
      summary: {
        resolutions: { resolved: 1, total: 3 },
        averageScoreOnTen: 8,
        approved: { count: 1, totalResolved: 1 },
        pending: 2,
      },
      referees: [
        {
          user: {
            id: 'admin-1',
            firstName: 'Ana',
            lastName: 'Admin',
            email: 'admin@example.com',
          },
          date: null,
          result: { scorePercent: null, scoreOnTen: null },
          retries: { used: 0, max: 2, remaining: 2 },
          status: 'PENDING',
        },
        {
          user: {
            id: 'user-1',
            firstName: 'Juan',
            lastName: 'González',
            email: 'juan@example.com',
          },
          date: finishedAt,
          result: { scorePercent: 80, scoreOnTen: 8 },
          retries: { used: 1, max: 2, remaining: 0 },
          status: 'APPROVED',
        },
        {
          user: {
            id: 'user-2',
            firstName: 'María',
            lastName: 'Rodríguez',
            email: 'maria@example.com',
          },
          date: null,
          result: { scorePercent: null, scoreOnTen: null },
          retries: { used: 1, max: 2, remaining: 1 },
          status: 'PENDING',
        },
      ],
    });
  });

  it('counts only finished exams in summary metrics when catalog is closed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-16T03:00:00.000Z'));

    const createdAt = new Date('2026-02-12T10:00:00.000Z');
    const approvedFinishedAt = new Date('2026-03-03T10:00:00.000Z');
    const failedFinishedAt = new Date('2026-03-05T10:00:00.000Z');

    prisma.finalExamCatalog.findUnique.mockResolvedValue({
      id: 'catalog-1',
      title: 'Final febrero',
      status: FinalExamCatalogStatus.PUBLISHED,
      questionCount: 20,
      availableUntilDate: '2026-03-15',
      maxRetries: 2,
      createdAt,
      competitions: [
        {
          competitionId: 'comp-1',
          competition: { id: 'comp-1', name: 'Liga Prof.' },
        },
      ],
    });
    prisma.competitionReferee.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        user: {
          id: 'user-1',
          firstName: 'Juan',
          lastName: 'González',
          email: 'juan@example.com',
        },
      },
      {
        userId: 'user-2',
        user: {
          id: 'user-2',
          firstName: 'María',
          lastName: 'Rodríguez',
          email: 'maria@example.com',
        },
      },
      {
        userId: 'user-3',
        user: {
          id: 'user-3',
          firstName: 'Pedro',
          lastName: 'Suárez',
          email: 'pedro@example.com',
        },
      },
    ]);
    prisma.exam.findMany.mockResolvedValue([
      {
        id: 'exam-3',
        userId: 'user-3',
        status: ExamStatus.PENDING,
        isPassed: null,
        scorePercent: null,
        attemptNumber: 1,
        createdAt: new Date('2026-03-10T10:00:00.000Z'),
        finishedAt: null,
      },
      {
        id: 'exam-2',
        userId: 'user-2',
        status: ExamStatus.FINISHED,
        isPassed: false,
        scorePercent: 40,
        attemptNumber: 1,
        createdAt: failedFinishedAt,
        finishedAt: failedFinishedAt,
      },
      {
        id: 'exam-1',
        userId: 'user-1',
        status: ExamStatus.FINISHED,
        isPassed: true,
        scorePercent: 80,
        attemptNumber: 1,
        createdAt: approvedFinishedAt,
        finishedAt: approvedFinishedAt,
      },
    ]);

    const result = await service.listCatalogReferees('catalog-1');

    expect(result.summary).toEqual({
      resolutions: { resolved: 2, total: 3 },
      averageScoreOnTen: 6,
      approved: { count: 1, totalResolved: 2 },
      pending: 0,
    });
    expect(result.referees).toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ id: 'user-1' }),
        status: 'APPROVED',
        result: { scorePercent: 80, scoreOnTen: 8 },
      }),
      expect.objectContaining({
        user: expect.objectContaining({ id: 'user-2' }),
        status: 'FAILED',
        result: { scorePercent: 40, scoreOnTen: 4 },
      }),
      expect.objectContaining({
        user: expect.objectContaining({ id: 'user-3' }),
        status: 'FAILED',
        result: { scorePercent: null, scoreOnTen: null },
      }),
    ]);
  });

  it('throws not found when listing referees for missing catalog', async () => {
    prisma.finalExamCatalog.findUnique.mockResolvedValue(null);

    await expect(service.listCatalogReferees('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
