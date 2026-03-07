import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
