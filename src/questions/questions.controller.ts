import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { QuestionsService } from './questions.service';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post('bulk')
  bulkCreate(@Body() payload: unknown) {
    return this.questionsService.bulkCreate(payload);
  }

  @Post('bulk/insert-139')
  bulkInsertAtOrder139(@Body() payload: unknown) {
    return this.questionsService.bulkInsertAtOrder139(payload);
  }

  @Get('categories')
  listCategories() {
    return this.questionsService.listCategories();
  }

  @Get()
  listQuestions(@Query('language') language?: string) {
    return this.questionsService.listQuestions(language);
  }
}
