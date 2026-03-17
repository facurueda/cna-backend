import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../auth/roles/roles.decorator";
import { RolesGuard } from "../auth/roles/roles.guard";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Trae usuarios asignables a competencia, incluyendo admins
  @Get("referees")
  listReferees(@Query("competitionId") competitionId?: string) {
    const normalized = competitionId?.trim();
    return this.users.listReferees(normalized || undefined);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get("stats/summary")
  getDashboardSummary() {
    return this.users.getDashboardSummary();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get("stats/final-evolution")
  getFinalEvolution(@Query("months") months?: string) {
    const parsedMonths =
      typeof months === "string" && months.trim().length > 0
        ? Number(months)
        : undefined;
    return this.users.getFinalEvolution(parsedMonths);
  }
}
