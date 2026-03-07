import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { FinalExamsController } from './final-exams.controller';
import { FinalExamsService } from './final-exams.service';

@Module({
  imports: [ExamsModule],
  controllers: [FinalExamsController],
  providers: [FinalExamsService],
})
export class FinalExamsModule {}
