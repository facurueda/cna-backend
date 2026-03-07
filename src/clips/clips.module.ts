import { Module } from "@nestjs/common";
import { ClipsService } from "./clips.service";
import { ClipsController } from "./clips.controller";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [UsersModule],
  controllers: [ClipsController],
  providers: [ClipsService],
})
export class ClipsModule {}
