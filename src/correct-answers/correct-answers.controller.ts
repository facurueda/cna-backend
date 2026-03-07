import { Body, Controller, Post } from '@nestjs/common';
import { CorrectAnswersService } from './correct-answers.service';

@Controller('correct-answers')
export class CorrectAnswersController {
  constructor(private readonly correctAnswersService: CorrectAnswersService) {}

  @Post('bulk')
  bulkCreate(@Body() payload: unknown) {
    return this.correctAnswersService.bulkCreate(payload);
  }
}
