import { Module } from "@nestjs/common";
import { ClipCategoriesController } from "./clip-categories.controller";
import { ClipCategoriesService } from "./clip-categories.service";

@Module({
  controllers: [ClipCategoriesController],
  providers: [ClipCategoriesService],
})
export class ClipCategoriesModule {}
