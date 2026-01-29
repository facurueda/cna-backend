import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";

import { AuthController } from "./auth.controller";
import { CognitoJwtStrategy } from "./cognito-jwt.strategy";
import { CognitoAuthGuard } from "./guards/cognito-auth.guard";
import { AuthService } from "./auth.service";

@Module({
  imports: [PassportModule.register({ defaultStrategy: "cognito" })],
  controllers: [AuthController],
  providers: [CognitoJwtStrategy, CognitoAuthGuard, AuthService],
})
export class AuthModule {}
