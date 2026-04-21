import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';

import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AppCredentialsService } from './app-credentials.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('Missing JWT_SECRET');

        const expiresInRaw = config.get<string>('JWT_EXPIRES_IN');
        const expiresIn =
          expiresInRaw && /^\d+$/.test(expiresInRaw)
            ? Number(expiresInRaw)
            : (expiresInRaw ?? '1d');

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as number | StringValue,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, JwtAuthGuard, AuthService, AppCredentialsService],
  exports: [JwtModule, AppCredentialsService],
})
export class AuthModule {}
