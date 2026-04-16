import { Module } from '@nestjs/common';
import { ClipCollectionsController } from './clip-collections.controller';
import { ClipCollectionsService } from './clip-collections.service';

@Module({
  controllers: [ClipCollectionsController],
  providers: [ClipCollectionsService],
})
export class ClipCollectionsModule {}
