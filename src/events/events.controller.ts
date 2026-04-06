import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';

type AuthUserPayload = { id: string; role: Role };

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(@Body() dto: CreateEventDto, @AuthUser() user: AuthUserPayload) {
    return this.eventsService.create(dto, user);
  }

  @Get('my')
  findMyEvents(@AuthUser() user: AuthUserPayload) {
    return this.eventsService.findMyEvents(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.eventsService.findOne(id, user);
  }
}
