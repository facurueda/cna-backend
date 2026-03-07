import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClipStatus, MatchStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClipDto } from './dto/create-clip.dto';
import { UpdateClipDto } from './dto/update-clip.dto';
import { CreateClipBatchDto } from './dto/create-clip-batch.dto';
import { UserStatsService } from '../users/user-stats.service';

type AuthUser = { id: string; role: Role };

@Injectable()
export class ClipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStatsService: UserStatsService,
  ) {}

  private async assertCanAccessMatchOrAdmin(matchId: string, user: AuthUser) {
    if (user.role === Role.ADMIN) return;

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, competitionId: true },
    });
    if (!match) throw new NotFoundException('Match no encontrado');

    const isCompetitionReferee =
      await this.prisma.competitionReferee.findUnique({
        where: {
          competitionId_userId: {
            competitionId: match.competitionId,
            userId: user.id,
          },
        },
        select: { competitionId: true },
      });

    if (!isCompetitionReferee) {
      throw new ForbiddenException('No sos árbitro asignado a este torneo');
    }
  }

  private async assertMatchOpen(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, status: true },
    });

    if (!match) throw new NotFoundException('Match no encontrado');
    if (match.status !== MatchStatus.OPEN) {
      throw new ForbiddenException('El partido está cerrado');
    }

    return match;
  }

  private async validateRefereeIdsBelongToMatch(
    matchId: string,
    refereeIds: string[],
  ) {
    if (!refereeIds.length) return;

    const refs = await this.prisma.matchReferee.findMany({
      where: { matchId, userId: { in: refereeIds } },
      select: { userId: true },
    });

    const validIds = new Set(refs.map((r) => r.userId));
    const invalid = refereeIds.filter((id) => !validIds.has(id));

    if (invalid.length) {
      throw new ForbiddenException(
        'Hay refereeIds que no pertenecen al partido',
      );
    }
  }

  async findMyClips(userId: string, scope: 'created' | 'as_referee' | 'all') {
    const where =
      scope === 'created'
        ? { createdById: userId }
        : scope === 'as_referee'
          ? { match: { competition: { referees: { some: { userId } } } } }
          : {
              OR: [
                { createdById: userId },
                { match: { competition: { referees: { some: { userId } } } } },
              ],
            };

    return this.prisma.clip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        match: {
          include: {
            competition: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        _count: { select: { comments: true } },
      },
    });
  }

  async create(dto: CreateClipDto, user: AuthUser) {
    await this.assertMatchOpen(dto.matchId);
    await this.assertCanAccessMatchOrAdmin(dto.matchId, user);

    if (dto.refereeIds?.length) {
      await this.validateRefereeIdsBelongToMatch(dto.matchId, dto.refereeIds);
    }

    return this.prisma.$transaction(async (tx) => {
      const createdClip = await tx.clip.create({
        data: {
          matchId: dto.matchId,
          title: dto.title.trim(),
          videoUrl: dto.videoUrl.trim(),
          thumbnailUrl: dto.thumbnailUrl?.trim(),
          duration: dto.duration,
          categories: dto.categoryIds?.length
            ? {
                createMany: {
                  data: dto.categoryIds.map((categoryId) => ({ categoryId })),
                  skipDuplicates: true,
                },
              }
            : undefined,
          createdById: user.id,
          referees: dto.refereeIds?.length
            ? {
                createMany: {
                  data: dto.refereeIds.map((userId) => ({ userId })),
                },
              }
            : undefined,
        },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          referees: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                },
              },
            },
          },
        },
      });

      await this.userStatsService.incrementClips(user.id, 1, tx);
      return createdClip;
    });
  }

  async createBatch(dto: CreateClipBatchDto, user: AuthUser) {
    // Valida una sola vez por match
    await this.assertMatchOpen(dto.matchId);
    await this.assertCanAccessMatchOrAdmin(dto.matchId, user);

    const created: Array<{
      id: string;
      title: string;
      thumbnailUrl: string | null;
      status: ClipStatus;
      createdAt: Date;
    }> = [];
    const failed: Array<{ index: number; reason: string }> = [];

    return this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < dto.clips.length; i++) {
        const item = dto.clips[i];

        if (!item.title?.trim()) {
          failed.push({ index: i, reason: 'Missing title' });
          continue;
        }
        if (!item.videoUrl?.trim()) {
          failed.push({ index: i, reason: 'Missing videoUrl' });
          continue;
        }

        if (item.refereeIds?.length) {
          const refs = await tx.matchReferee.findMany({
            where: { matchId: dto.matchId, userId: { in: item.refereeIds } },
            select: { userId: true },
          });
          const validIds = new Set(refs.map((r) => r.userId));
          const invalid = item.refereeIds.filter((id) => !validIds.has(id));
          if (invalid.length) {
            failed.push({ index: i, reason: 'Invalid refereeIds for match' });
            continue;
          }
        }

        const clip = await tx.clip.create({
          data: {
            matchId: dto.matchId,
            title: item.title.trim(),
            videoUrl: item.videoUrl.trim(),
            thumbnailUrl: item.thumbnailUrl?.trim(),
            duration: item.duration,
            categories: item.categoryIds?.length
              ? {
                  createMany: {
                    data: item.categoryIds.map((categoryId) => ({
                      categoryId,
                    })),
                    skipDuplicates: true,
                  },
                }
              : undefined,
            createdById: user.id,
            referees: item.refereeIds?.length
              ? {
                  createMany: {
                    data: item.refereeIds.map((userId) => ({ userId })),
                  },
                }
              : undefined,
          },
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            status: true,
            createdAt: true,
          },
        });

        created.push(clip);
      }

      if (created.length > 0) {
        await this.userStatsService.incrementClips(user.id, created.length, tx);
      }

      return { created, failed };
    });
  }

  async list(matchId: string | undefined, user: AuthUser) {
    if (matchId) {
      return this.listByMatch(matchId, user);
    }

    if (user.role !== Role.ADMIN) {
      throw new BadRequestException('matchId is required for non-admin users');
    }

    return this.prisma.clip.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        match: {
          include: {
            competition: { select: { id: true, name: true } },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        _count: { select: { comments: true } },
      },
    });
  }

  async listByMatch(matchId: string, user: AuthUser) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true },
    });
    if (!match) throw new NotFoundException('Match no encontrado');

    await this.assertCanAccessMatchOrAdmin(matchId, user);

    return this.prisma.clip.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async getById(id: string, user: AuthUser) {
    const clip = await this.prisma.clip.findUnique({
      where: { id },
      select: {
        id: true,
        matchId: true,
        title: true,
        videoUrl: true,
        thumbnailUrl: true,
        duration: true,
        status: true,
        createdAt: true,
        updatedAt: true,

        // ✅ clave para ordenar decisión final arriba
        finalDecisionCommentId: true,

        match: {
          select: {
            id: true,
            competitionId: true,
            status: true,
            teamA: true,
            teamB: true,
            category: true,
            date: true,
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        referees: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!clip) throw new NotFoundException('Clip no encontrado');

    await this.assertCanAccessMatchOrAdmin(clip.matchId, user);

    if (clip.finalDecisionCommentId) {
      const idx = clip.comments.findIndex(
        (c) => c.id === clip.finalDecisionCommentId,
      );

      if (idx !== -1) {
        const [finalComment] = clip.comments.splice(idx, 1);
        clip.comments = [finalComment, ...clip.comments];
      }
    }

    return clip;
  }

  async update(id: string, dto: UpdateClipDto, user: AuthUser) {
    const clip = await this.prisma.clip.findUnique({
      where: { id },
      select: { id: true, status: true, createdById: true, matchId: true },
    });
    if (!clip) throw new NotFoundException('Clip no encontrado');

    if (clip.createdById !== user.id) {
      throw new ForbiddenException('Solo podés editar tus clips');
    }
    if (clip.status !== ClipStatus.OPEN) {
      throw new ForbiddenException('El clip está cerrado');
    }

    if (dto.refereeIds?.length) {
      await this.validateRefereeIdsBelongToMatch(clip.matchId, dto.refereeIds);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.refereeIds) {
        await tx.clipReferee.deleteMany({ where: { clipId: id } });
        if (dto.refereeIds.length) {
          await tx.clipReferee.createMany({
            data: dto.refereeIds.map((userId) => ({ clipId: id, userId })),
          });
        }
      }

      if (dto.categoryIds) {
        await tx.clipCategoryOnClip.deleteMany({ where: { clipId: id } });
        if (dto.categoryIds.length) {
          await tx.clipCategoryOnClip.createMany({
            data: dto.categoryIds.map((categoryId) => ({
              clipId: id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.clip.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          videoUrl: dto.videoUrl?.trim(),
          thumbnailUrl: dto.thumbnailUrl?.trim(),
          duration: dto.duration,
        },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          referees: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  role: true,
                },
              },
            },
          },
        },
      });
    });
  }

  async remove(id: string, user: AuthUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede borrar clips');
    }

    const clip = await this.prisma.clip.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!clip) throw new NotFoundException('Clip no encontrado');

    await this.prisma.clip.delete({ where: { id } });
    return { ok: true };
  }

  async close(id: string, user: AuthUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede cerrar clips');
    }

    return this.prisma.clip.update({
      where: { id },
      data: { status: ClipStatus.CLOSED },
    });
  }

  async open(id: string, user: AuthUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede reabrir clips');
    }

    return this.prisma.clip.update({
      where: { id },
      data: { status: ClipStatus.OPEN },
    });
  }
}
