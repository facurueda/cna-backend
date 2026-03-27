import { Module } from '@nestjs/common';
import { ButtonLayoutsController } from './button-layouts.controller';
import { ButtonLayoutsService } from './button-layouts.service';

@Module({
  controllers: [ButtonLayoutsController],
  providers: [ButtonLayoutsService],
})
export class ButtonLayoutsModule {}
