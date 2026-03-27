import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ButtonLayoutsService } from './button-layouts.service';
import { CreateButtonLayoutDto } from './dto/create-button-layout.dto';
import { UpdateButtonLayoutDto } from './dto/update-button-layout.dto';

type AuthUserPayload = { id: string; role: Role };

@Controller('button-layouts')
@UseGuards(JwtAuthGuard)
export class ButtonLayoutsController {
  constructor(private readonly buttonLayoutsService: ButtonLayoutsService) {}

  @Post()
  create(
    @Body() dto: CreateButtonLayoutDto,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.buttonLayoutsService.create(dto, user);
  }

  @Get('my')
  findMyLayouts(@AuthUser() user: AuthUserPayload) {
    return this.buttonLayoutsService.findMyLayouts(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.buttonLayoutsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateButtonLayoutDto,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.buttonLayoutsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.buttonLayoutsService.remove(id, user);
  }
}
