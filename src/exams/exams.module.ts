import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { UsersModule } from '../users/users.module';
import { RefereeExamsController } from './referee-exams.controller';

@Module({
  imports: [UsersModule],
  controllers: [ExamsController, RefereeExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
