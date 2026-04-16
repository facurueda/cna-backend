import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { UploadsService } from './uploads.service';
import { PresignDto } from './dto/presign.dto';
import { ReadDto } from './dto/read.dto';

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('presign')
  presign(@Body() dto: PresignDto) {
    return this.uploads.presign(dto);
  }

  @Post('read')
  presignRead(@Body() dto: ReadDto) {
    return this.uploads.presignRead(dto);
  }
}
