import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnswerExamQuestionDto } from './dto/answer-exam-question.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamsService } from './exams.service';

type AuthUserPayload = {
  id: string;
  role: Role;
};

@Controller('exams')
@UseGuards(JwtAuthGuard)
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  create(@AuthUser() user: AuthUserPayload, @Body() dto: CreateExamDto) {
    return this.examsService.create(user, dto);
  }

  @Get('my')
  findMyExams(@AuthUser() user: AuthUserPayload) {
    return this.examsService.findMyExams(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.examsService.findOne(id, user);
  }

  @Get(':examId/review')
  findReview(
    @Param('examId') examId: string,
    @AuthUser() user: AuthUserPayload,
  ) {
    return this.examsService.findReview(examId, user);
  }

  @Post(':id/answer')
  answer(
    @Param('id') id: string,
    @AuthUser() user: AuthUserPayload,
    @Body() dto: AnswerExamQuestionDto,
  ) {
    return this.examsService.answer(id, user, dto);
  }

  @Post(':id/finish')
  finish(@Param('id') id: string, @AuthUser() user: AuthUserPayload) {
    return this.examsService.finish(id, user);
  }
}
