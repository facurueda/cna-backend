import { Module } from '@nestjs/common';
import { StudyMaterialsController } from './study-materials.controller';
import { StudyMaterialsService } from './study-materials.service';

@Module({
  controllers: [StudyMaterialsController],
  providers: [StudyMaterialsService],
})
export class StudyMaterialsModule {}
