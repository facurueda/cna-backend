import { Controller, Get, UseGuards } from "@nestjs/common";
import { ClipCategoriesService } from "./clip-categories.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("clip-categories")
@UseGuards(JwtAuthGuard)
export class ClipCategoriesController {
  constructor(private readonly categories: ClipCategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }
}
