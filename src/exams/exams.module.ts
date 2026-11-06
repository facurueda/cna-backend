import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { UsersModule } from '../users/users.module';
import { RefereeExamsController } from './referee-exams.controller';
import { ExamActivityBus } from './exam-activity.bus';

@Module({
  imports: [UsersModule],
  controllers: [ExamsController, RefereeExamsController],
  providers: [ExamsService, ExamActivityBus],
  exports: [ExamsService, ExamActivityBus],
})
export class ExamsModule {}
