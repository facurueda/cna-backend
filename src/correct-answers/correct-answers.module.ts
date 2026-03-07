import { Module } from '@nestjs/common';
import { CorrectAnswersController } from './correct-answers.controller';
import { CorrectAnswersService } from './correct-answers.service';

@Module({
  controllers: [CorrectAnswersController],
  providers: [CorrectAnswersService],
})
export class CorrectAnswersModule {}
