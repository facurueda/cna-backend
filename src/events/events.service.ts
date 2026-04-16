import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventItemDto } from './dto/create-event-item.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventItemDto } from './dto/update-event-item.dto';

type AuthUser = Pick<AuthenticatedUser, 'id' | 'role' | 'authType'>;

type UserEventWithItems = Prisma.UserEventGetPayload<{
  include: { items: true };
}>;

type UserEventItemRecord = Prisma.UserEventItemGetPayload<
  Record<string, never>
>;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto, user: AuthUser) {
    const eventName = this.resolveCreateEventName(dto);

    const createdEvent = await this.prisma.$transaction(async (tx) => {
      const event = await tx.userEvent.create({
        data: {
          userId: user.id,
          eventName,
        },
        select: { id: true },
      });

      if (dto.events.length > 0) {
        await tx.userEventItem.createMany({
          data: dto.events.map((item, index) =>
            this.buildItemCreateInput(event.id, item, index),
          ),
        });
      }

      return event;
    });

    return this.findSerializedEvent(createdEvent.id);
  }

  async findMyEvents(user: AuthUser) {
    const events = await this.prisma.userEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { position: 'asc' },
        },
      },
    });

    return events.map((event) => this.serializeEvent(event));
  }

  async findOne(id: string, user: AuthUser) {
    const event = await this.findAccessibleEvent(id, user);
    return this.serializeEvent(event);
  }

  async update(id: string, dto: UpdateEventDto, user: AuthUser) {
    await this.findAccessibleEvent(id, user);

    const data: Prisma.UserEventUpdateInput = {};
    if (dto.eventName !== undefined) {
      data.eventName = dto.eventName.trim();
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.userEvent.update({
        where: { id },
        data,
      });
    }

    return this.findSerializedEvent(id);
  }

  async remove(id: string, user: AuthUser) {
    await this.findAccessibleEvent(id, user);

    await this.prisma.userEvent.delete({
      where: { id },
    });

    return { ok: true };
  }

  async createItem(eventId: string, dto: CreateEventItemDto, user: AuthUser) {
    await this.findAccessibleEvent(eventId, user);

    const item = await this.prisma.$transaction(async (tx) => {
      const lastItem = await tx.userEventItem.findFirst({
        where: { eventId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });

      return tx.userEventItem.create({
        data: this.buildItemCreateInput(
          eventId,
          dto,
          (lastItem?.position ?? -1) + 1,
        ),
      });
    });

    return this.serializeItem(item);
  }

  async updateItem(
    eventId: string,
    itemId: string,
    dto: UpdateEventItemDto,
    user: AuthUser,
  ) {
    await this.findAccessibleEvent(eventId, user);
    await this.findItemOrThrow(eventId, itemId);

    const data: Prisma.UserEventItemUpdateInput = {};

    if (dto.category !== undefined) data.category = dto.category.trim();
    if (dto.createdAt !== undefined) data.createdAt = new Date(dto.createdAt);
    if (dto.endTime !== undefined) data.endTime = dto.endTime.trim();
    if (dto.endTimeMs !== undefined) data.endTimeMs = dto.endTimeMs;
    if (dto.eventTimeMs !== undefined) data.eventTimeMs = dto.eventTimeMs;
    if (dto.incrementId !== undefined) data.incrementId = dto.incrementId;
    if (dto.startTime !== undefined) data.startTime = dto.startTime.trim();
    if (dto.startTimeMs !== undefined) data.startTimeMs = dto.startTimeMs;
    if (dto.tileId !== undefined) data.tileId = dto.tileId.trim();
    if (dto.title !== undefined) data.title = dto.title.trim();

    if (Object.keys(data).length === 0) {
      const existing = await this.findItemOrThrow(eventId, itemId);
      return this.serializeItem(existing);
    }

    const item = await this.prisma.userEventItem.update({
      where: { id: itemId },
      data,
    });

    return this.serializeItem(item);
  }

  async removeItem(eventId: string, itemId: string, user: AuthUser) {
    await this.findAccessibleEvent(eventId, user);
    await this.findItemOrThrow(eventId, itemId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userEventItem.delete({
        where: { id: itemId },
      });

      const remainingItems = await tx.userEventItem.findMany({
        where: { eventId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });

      await Promise.all(
        remainingItems.map((item, index) =>
          tx.userEventItem.update({
            where: { id: item.id },
            data: { position: index },
          }),
        ),
      );
    });

    return { ok: true };
  }

  private async findAccessibleEvent(id: string, user: AuthUser) {
    const event = await this.prisma.userEvent.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    if (!this.canAccessForeignEvents(user) && event.userId !== user.id) {
      throw new ForbiddenException('No tenés acceso a este evento');
    }

    return event;
  }

  private async findSerializedEvent(id: string) {
    const event = await this.prisma.userEvent.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Evento no encontrado');
    }

    return this.serializeEvent(event);
  }

  private async findItemOrThrow(eventId: string, itemId: string) {
    const item = await this.prisma.userEventItem.findFirst({
      where: {
        id: itemId,
        eventId,
      },
    });

    if (!item) {
      throw new NotFoundException('Evento item no encontrado');
    }

    return item;
  }

  private canAccessForeignEvents(user: AuthUser) {
    return user.authType !== 'app_credential' && user.role === Role.ADMIN;
  }

  private buildItemCreateInput(
    eventId: string,
    item: CreateEventItemDto,
    position: number,
  ): Prisma.UserEventItemUncheckedCreateInput {
    return {
      eventId,
      position,
      category: item.category.trim(),
      createdAt: new Date(item.createdAt),
      endTime: item.endTime.trim(),
      endTimeMs: item.endTimeMs,
      eventTimeMs: item.eventTimeMs,
      incrementId: item.incrementId,
      startTime: item.startTime.trim(),
      startTimeMs: item.startTimeMs,
      tileId: item.tileId.trim(),
      title: item.title.trim(),
    };
  }

  private resolveCreateEventName(dto: CreateEventDto) {
    return (dto.eventName ?? dto.name ?? '').trim();
  }

  private serializeEvent(event: UserEventWithItems) {
    return {
      id: event.id,
      userId: event.userId,
      eventName: event.eventName,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      events: [...event.items]
        .sort((left, right) => left.position - right.position)
        .map((item) => this.serializeItem(item)),
    };
  }

  private serializeItem(item: UserEventItemRecord) {
    return {
      id: item.id,
      position: item.position,
      category: item.category,
      createdAt: item.createdAt,
      endTime: item.endTime,
      endTimeMs: item.endTimeMs,
      eventTimeMs: item.eventTimeMs,
      incrementId: item.incrementId,
      startTime: item.startTime,
      startTimeMs: item.startTimeMs,
      tileId: item.tileId,
      title: item.title,
    };
  }
}
