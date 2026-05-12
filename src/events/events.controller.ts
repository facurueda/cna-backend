import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { AppCredentialScopes } from '../auth/decorators/app-credential-scopes.decorator';
import { JwtOrAppCredentialGuard } from '../auth/guards/jwt-or-app-credential.guard';
import { APP_CREDENTIAL_SCOPES } from '../auth/app-credentials.constants';
import { AuthenticatedUser } from '../auth/auth-user.types';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventItemDto } from './dto/create-event-item.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventItemDto } from './dto/update-event-item.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly jwt: JwtService,
  ) {}

  @Post()
  @UseGuards(JwtOrAppCredentialGuard)
  @AppCredentialScopes(APP_CREDENTIAL_SCOPES.EVENTS_WRITE)
  create(@Body() dto: CreateEventDto, @AuthUser() user: AuthenticatedUser) {
    return this.eventsService.create(dto, user);
  }

  @Get('my')
  findMyEvents(@Headers('authorization') authorization: string) {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : null;
    const payload = token ? this.jwt.decode(token) : null;
    const userId = payload?.sub ?? null;
    return this.eventsService.findMyEvents(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtOrAppCredentialGuard)
  @AppCredentialScopes(APP_CREDENTIAL_SCOPES.EVENTS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.update(id, dto, user);
  }

  @Delete(':id')
  @UseGuards(JwtOrAppCredentialGuard)
  @AppCredentialScopes(APP_CREDENTIAL_SCOPES.EVENTS_WRITE)
  remove(@Param('id') id: string, @AuthUser() user: AuthenticatedUser) {
    return this.eventsService.remove(id, user);
  }

  @Post(':id/items')
  @UseGuards(JwtOrAppCredentialGuard)
  @AppCredentialScopes(APP_CREDENTIAL_SCOPES.EVENTS_WRITE)
  createItem(
    @Param('id') id: string,
    @Body() dto: CreateEventItemDto,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.createItem(id, dto, user);
  }

  @Patch(':eventId/items/:itemId')
  @UseGuards(JwtOrAppCredentialGuard)
  @AppCredentialScopes(APP_CREDENTIAL_SCOPES.EVENTS_WRITE)
  updateItem(
    @Param('eventId') eventId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateEventItemDto,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.updateItem(eventId, itemId, dto, user);
  }

  @Delete(':eventId/items/:itemId')
  @UseGuards(JwtOrAppCredentialGuard)
  @AppCredentialScopes(APP_CREDENTIAL_SCOPES.EVENTS_WRITE)
  removeItem(
    @Param('eventId') eventId: string,
    @Param('itemId') itemId: string,
    @AuthUser() user: AuthenticatedUser,
  ) {
    return this.eventsService.removeItem(eventId, itemId, user);
  }
}
