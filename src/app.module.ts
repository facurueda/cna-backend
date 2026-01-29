import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { MatchesModule } from './matches/matches.module';
import { ClipsModule } from './clips/clips.module';
import { CommentsModule } from './comments/comments.module';
import { UploadsModule } from './uploads/uploads.module';
import { HealthModule } from './health/health.module';

ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
});

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    HealthModule,
    CompetitionsModule,
    MatchesModule,
    ClipsModule,
    CommentsModule,
    UploadsModule,
  ],
})
export class AppModule {}
