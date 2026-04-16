import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { MatchesModule } from './matches/matches.module';
import { ClipsModule } from './clips/clips.module';
import { UploadsModule } from './uploads/uploads.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { ClipCollectionsModule } from './clip-collections/clip-collections.module';
import { ClipCategoriesModule } from './clip-categories/clip-categories.module';
import { QuestionsModule } from './questions/questions.module';
import { CorrectAnswersModule } from './correct-answers/correct-answers.module';
import { ExamsModule } from './exams/exams.module';
import { FinalExamsModule } from './final-exams/final-exams.module';
import { EventsModule } from './events/events.module';
import { ButtonLayoutsModule } from './button-layouts/button-layouts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
    PrismaModule,
    HealthModule,
    CompetitionsModule,
    MatchesModule,
    ClipsModule,
    ClipCollectionsModule,
    UploadsModule,
    UsersModule,
    ClipCategoriesModule,
    QuestionsModule,
    CorrectAnswersModule,
    ExamsModule,
    FinalExamsModule,
    EventsModule,
    ButtonLayoutsModule,
  ],
})
export class AppModule {}
