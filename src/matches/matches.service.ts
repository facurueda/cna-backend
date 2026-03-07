import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { ClipStatus, MatchStatus, Role } from '@prisma/client';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  private async withClipStats<T extends { id: string }>(matches: T[]) {
    if (!matches.length) {
      return matches.map((match) => ({
        ...match,
        clipsTotal: 0,
        clipsClosed: 0,
        allClipsClosed: false,
        clipsProgress: 0,
      }));
    }

    const matchIds = matches.map((match) => match.id);
    const grouped = await this.prisma.clip.groupBy({
      by: ['matchId', 'status'],
      where: { matchId: { in: matchIds } },
      _count: { _all: true },
    });

    const counts = new Map<string, { total: number; closed: number }>();
    for (const row of grouped) {
      const entry = counts.get(row.matchId) ?? { total: 0, closed: 0 };
      entry.total += row._count._all;
      if (row.status === ClipStatus.CLOSED) {
        entry.closed += row._count._all;
      }
      counts.set(row.matchId, entry);
    }

    return matches.map((match) => {
      const stat = counts.get(match.id) ?? { total: 0, closed: 0 };
      return {
        ...match,
        clipsTotal: stat.total,
        clipsClosed: stat.closed,
        allClipsClosed: stat.total > 0 && stat.closed === stat.total,
        clipsProgress:
          stat.total > 0 ? Math.round((stat.closed / stat.total) * 100) : 0,
      };
    });
  }

  async findMyMatches(user: { id: string; role: Role }) {
    if (user.role === Role.ADMIN) {
      const matches = await this.prisma.match.findMany({
        orderBy: { date: 'desc' },
        include: {
          competition: { select: { id: true, name: true } },
          referees: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, role: true },
              },
            },
          },
          _count: { select: { clips: true } },
        },
      });
      return this.withClipStats(matches);
    }

    const matches = await this.prisma.match.findMany({
      where: {
        competition: { referees: { some: { userId: user.id } } },
      },
      orderBy: { date: 'desc' },
      include: {
        competition: { select: { id: true, name: true } },
        referees: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
        _count: { select: { clips: true } },
      },
    });
    return this.withClipStats(matches);
  }

  async create(dto: CreateMatchDto) {
    // chequeo de competencia existente
    const competition = await this.prisma.competition.findUnique({
      where: { id: dto.competitionId },
      select: { id: true },
    });
    if (!competition) throw new NotFoundException('Competition not found');

    const date = dto.date ? new Date(dto.date) : undefined;
    if (dto.date && Number.isNaN(date?.getTime()))
      throw new BadRequestException('Invalid date');

    return this.prisma.match.create({
      data: {
        competitionId: dto.competitionId,
        teamA: dto.teamA.trim(),
        teamB: dto.teamB.trim(),
        ...(dto.category ? { category: dto.category.trim() } : {}),
        ...(date ? { date } : {}),
        referees: dto.refereeIds?.length
          ? {
              createMany: {
                data: dto.refereeIds.map((userId) => ({ userId })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: {
        referees: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });
  }

  async findAllByCompetition(competitionId: string) {
    const matches = await this.prisma.match.findMany({
      where: { competitionId },
      orderBy: { date: 'desc' },
      include: {
        referees: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
      },
    });
    return this.withClipStats(matches);
  }

  async findOne(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        competition: { select: { id: true, name: true, seasonLabel: true } },
        referees: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
      },
    });

    if (!match) throw new NotFoundException('Match not found');
    const [withStats] = await this.withClipStats([match]);
    return withStats;
  }

  async update(id: string, dto: UpdateMatchDto) {
    await this.findOne(id);

    const date = dto.date ? new Date(dto.date) : undefined;
    if (dto.date && Number.isNaN(date?.getTime()))
      throw new BadRequestException('Invalid date');

    return this.prisma.match.update({
      where: { id },
      data: {
        competitionId: dto.competitionId,
        teamA: dto.teamA?.trim(),
        teamB: dto.teamB?.trim(),
        category: dto.category?.trim(),
        date: date ?? undefined,
      },
    });
  }

  async close(id: string) {
    await this.findOne(id);
    return this.prisma.match.update({
      where: { id },
      data: { status: MatchStatus.CLOSED },
    });
  }

  async open(id: string) {
    await this.findOne(id);
    return this.prisma.match.update({
      where: { id },
      data: { status: MatchStatus.OPEN },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.match.delete({ where: { id } });
  }

  async setReferees(matchId: string, refereeIds: string[]) {
    await this.findOne(matchId);

    // Reemplazo total: borra y setea
    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        referees: {
          deleteMany: {},
          createMany: {
            data: refereeIds.map((userId) => ({ userId })),
            skipDuplicates: true,
          },
        },
      },
      include: {
        referees: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
      },
    });
  }
}
