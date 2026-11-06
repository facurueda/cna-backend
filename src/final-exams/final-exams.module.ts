import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ExamsModule } from '../exams/exams.module';
import { FinalExamsController } from './final-exams.controller';
import { FinalExamsGateway } from './final-exams.gateway';
import { FinalExamsService } from './final-exams.service';

@Module({
  imports: [ExamsModule, AuthModule],
  controllers: [FinalExamsController],
  providers: [FinalExamsService, FinalExamsGateway],
})
export class FinalExamsModule {}
