import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClipStatus, Role } from "@prisma/client";
import { CreateCommentDto } from "./dto/create-comment.dto";
import { UserStatsService } from "../users/user-stats.service";

type AuthUser = { id: string; role: Role };

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStatsService: UserStatsService,
  ) {}

  private async assertCanAccessClip(clipId: string, user: AuthUser) {
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: {
        id: true,
        matchId: true,
        status: true,
        match: { select: { competitionId: true } },
      },
    });
    if (!clip) throw new NotFoundException("Clip no encontrado");

    // Admin siempre
    if (user.role === Role.ADMIN) return clip;

    const competitionId = clip.match?.competitionId;
    if (!competitionId) throw new NotFoundException("Match no encontrado");

    const isReferee = await this.prisma.competitionReferee.findUnique({
      where: {
        competitionId_userId: {
          competitionId,
          userId: user.id,
        },
      },
      select: { competitionId: true },
    });

    if (!isReferee) throw new ForbiddenException("No tenés acceso a este clip");
    return clip;
  }

  async create(dto: CreateCommentDto, user: AuthUser) {
    const clip = await this.assertCanAccessClip(dto.clipId, user);

    // Regla: si el clip está cerrado, solo admin comenta
    if (clip.status === ClipStatus.CLOSED && user.role !== Role.ADMIN) {
      throw new ForbiddenException("El clip está cerrado, solo admin puede comentar");
    }

    return this.prisma.$transaction(async (tx) => {
      const createdComment = await tx.comment.create({
        data: {
          clipId: dto.clipId,
          userId: user.id,
          content: dto.content,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      await this.userStatsService.incrementComments(user.id, 1, tx);
      return createdComment;
    });
  }

  async listByClip(clipId: string, user: AuthUser) {
    await this.assertCanAccessClip(clipId, user);

    // Orden: el comentario final primero (si existe), luego el resto por fecha asc
    // (Como tu schema tiene finalDecisionCommentId en Clip, lo resolvemos en 2 pasos)
    const clip = await this.prisma.clip.findUnique({
      where: { id: clipId },
      select: { finalDecisionCommentId: true },
    });
    if (!clip) throw new NotFoundException("Clip no encontrado");

    const comments = await this.prisma.comment.findMany({
      where: { clipId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    if (!clip.finalDecisionCommentId) return comments;

    const idx = comments.findIndex((c) => c.id === clip.finalDecisionCommentId);
    if (idx === -1) return comments;

    const [finalComment] = comments.splice(idx, 1);
    return [finalComment, ...comments];
  }

  async setFinalDecision(commentId: string, user: AuthUser) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException("Solo admin puede marcar decisión final");

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, clipId: true },
    });
    if (!comment) throw new NotFoundException("Comentario no encontrado");

    // Transacción: desmarcar anteriores + marcar este + setear en clip + cerrar clip
    return this.prisma.$transaction(async (tx) => {
      await tx.comment.updateMany({
        where: { clipId: comment.clipId, isFinalDecision: true },
        data: { isFinalDecision: false },
      });

      await tx.comment.update({
        where: { id: commentId },
        data: { isFinalDecision: true },
      });

      const updatedClip = await tx.clip.update({
        where: { id: comment.clipId },
        data: {
          finalDecisionCommentId: commentId,
          status: ClipStatus.CLOSED,
        },
        select: { id: true, status: true, finalDecisionCommentId: true },
      });

      return updatedClip;
    });
  }

  async unsetFinalDecision(commentId: string, user: AuthUser) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException("Solo admin puede desmarcar decisión final");

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, clipId: true, isFinalDecision: true },
    });
    if (!comment) throw new NotFoundException("Comentario no encontrado");
    if (!comment.isFinalDecision) return { ok: true };

    return this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { isFinalDecision: false },
      });

      await tx.clip.update({
        where: { id: comment.clipId },
        data: {
          finalDecisionCommentId: null,
          status: ClipStatus.OPEN, // opcional: reabrimos el clip
        },
      });

      return { ok: true };
    });
  }
}
