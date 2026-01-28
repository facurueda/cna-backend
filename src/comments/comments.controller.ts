import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CommentsService } from "./comments.service";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { RolesGuard } from "../auth/roles/roles.guard";
import { AuthUser } from "src/auth/decorators/auth-user.decorator";
import { Roles } from "../auth/roles/roles.decorator";
import { Role } from "@prisma/client";

@Controller("comments")
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  create(@Body() dto: CreateCommentDto, @AuthUser() user: any) {
    return this.commentsService.create(dto, user);
  }

  @Get()
  list(@Query("clipId") clipId: string, @AuthUser() user: any) {
    return this.commentsService.listByClip(clipId, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(":id/final-decision")
  setFinalDecision(@Param("id") id: string, @AuthUser() user: any) {
    return this.commentsService.setFinalDecision(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post(":id/unset-final-decision")
  unsetFinalDecision(@Param("id") id: string, @AuthUser() user: any) {
    return this.commentsService.unsetFinalDecision(id, user);
  }
}