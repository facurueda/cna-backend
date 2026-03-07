import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { UserStatsService } from "./user-stats.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserStatsService],
  exports: [UsersService, UserStatsService],
})
export class UsersModule {}
