import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { EventsService } from './events.service';

describe('EventsService', () => {
  const prisma = {
    userEvent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userEventItem: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  let service: EventsService;

  const ownedEvent = {
    id: 'event-1',
    userId: 'user-1',
    eventName: 'Final',
    createdAt: new Date('2026-04-15T12:00:00.000Z'),
    updatedAt: new Date('2026-04-15T12:00:00.000Z'),
    items: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventsService(prisma as never);
  });

  it('does not allow app credentials to use the admin bypass on foreign events', async () => {
    prisma.userEvent.findUnique.mockResolvedValue({
      ...ownedEvent,
      userId: 'another-user',
    });

    await expect(
      service.findOne('event-1', {
        id: 'admin-user',
        role: Role.ADMIN,
        authType: 'app_credential',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts event payloads that come with name instead of eventName', async () => {
    const tx = {
      userEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-2' }),
      },
      userEventItem: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    prisma.userEvent.findUnique.mockResolvedValue({
      id: 'event-2',
      userId: 'user-1',
      eventName: 'Peña - Deheza - 1er Tiempo',
      createdAt: new Date('2026-04-15T12:00:00.000Z'),
      updatedAt: new Date('2026-04-15T12:00:00.000Z'),
      items: [],
    });

    await service.create(
      {
        name: 'Peña - Deheza - 1er Tiempo',
        events: [],
      },
      {
        id: 'user-1',
        role: Role.GENERAL,
        authType: 'app_credential',
      },
    );

    expect(tx.userEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        eventName: 'Peña - Deheza - 1er Tiempo',
      },
      select: { id: true },
    });
  });

  it('appends new items at the end of the event timeline', async () => {
    const tx = {
      userEventItem: {
        findFirst: jest.fn().mockResolvedValue({ position: 2 }),
        create: jest.fn().mockResolvedValue({
          id: 'item-4',
          eventId: 'event-1',
          position: 3,
          category: 'goal',
          createdAt: new Date('2026-04-15T12:00:00.000Z'),
          endTime: '00:20',
          endTimeMs: 20000,
          eventTimeMs: 18000,
          incrementId: 4,
          startTime: '00:18',
          startTimeMs: 18000,
          tileId: 'tile-9',
          title: 'Gol',
        }),
      },
    };

    prisma.userEvent.findUnique.mockResolvedValue(ownedEvent);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await service.createItem(
      'event-1',
      {
        category: 'goal',
        createdAt: '2026-04-15T12:00:00.000Z',
        endTime: '00:20',
        endTimeMs: 20000,
        eventTimeMs: 18000,
        incrementId: 4,
        startTime: '00:18',
        startTimeMs: 18000,
        tileId: 'tile-9',
        title: 'Gol',
      },
      {
        id: 'user-1',
        role: Role.GENERAL,
        authType: 'jwt',
      },
    );

    expect(tx.userEventItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: 'event-1',
        position: 3,
        category: 'goal',
        tileId: 'tile-9',
      }),
    });
    expect(result.position).toBe(3);
  });

  it('reindexes remaining items after deleting one', async () => {
    const tx = {
      userEventItem: {
        delete: jest.fn().mockResolvedValue(undefined),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'item-2' }, { id: 'item-3' }]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    prisma.userEvent.findUnique.mockResolvedValue(ownedEvent);
    prisma.userEventItem.findFirst.mockResolvedValue({
      id: 'item-1',
      eventId: 'event-1',
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await service.removeItem('event-1', 'item-1', {
      id: 'user-1',
      role: Role.GENERAL,
      authType: 'jwt',
    });

    expect(tx.userEventItem.delete).toHaveBeenCalledWith({
      where: { id: 'item-1' },
    });
    expect(tx.userEventItem.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'item-2' },
      data: { position: 0 },
    });
    expect(tx.userEventItem.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'item-3' },
      data: { position: 1 },
    });
    expect(result).toEqual({ ok: true });
  });
});
