import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { JwtOrAppCredentialGuard } from '../auth/guards/jwt-or-app-credential.guard';

@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventsService, JwtOrAppCredentialGuard],
})
export class EventsModule {}
