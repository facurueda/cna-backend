import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';

type AuthUser = { id: string; role: Role };

type UserEventWithItems = Prisma.UserEventGetPayload<{
  include: { items: true };
}>;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const createdEvent = await tx.userEvent.create({
        data: {
          userId: user.id,
          eventName: dto.eventName.trim(),
        },
        select: { id: true },
      });

      if (dto.events.length > 0) {
        await tx.userEventItem.createMany({
          data: dto.events.map((item, index) => ({
            eventId: createdEvent.id,
            position: index,
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
          })),
        });
      }

      const event = await tx.userEvent.findUnique({
        where: { id: createdEvent.id },
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
    });
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

    if (user.role !== Role.ADMIN && event.userId !== user.id) {
      throw new ForbiddenException('No tenés acceso a este evento');
    }

    return this.serializeEvent(event);
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
        .map((item) => ({
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
        })),
    };
  }
}
