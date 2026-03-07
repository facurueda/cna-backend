import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { UpdateCompetitionDto } from './dto/update-competition.dto';
import { Role } from '@prisma/client';

@Injectable()
export class CompetitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyCompetitions(user: { id: string; role: Role }) {
    const isAdmin = user.role === Role.ADMIN;

    const competitions = await this.prisma.competition.findMany({
      where: isAdmin
        ? undefined
        : {
            referees: {
              some: { userId: user.id },
            },
          },
      include: {
        matches: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { date: true },
        },
      },
    });

    const counts = await this.computeMatchStats(
      competitions.map((competition) => competition.id),
    );

    return competitions
      .map((c) => ({
        id: c.id,
        name: c.name,
        seasonLabel: c.seasonLabel,
        matchesCount: counts.get(c.id)?.total ?? 0,
        matchesClosedCount: counts.get(c.id)?.closed ?? 0,
        lastMatchDate: c.matches[0]?.date ?? null, // admin: último match global, general: último match del user
      }))
      .sort((a, b) => {
        const ad = a.lastMatchDate ? new Date(a.lastMatchDate).getTime() : 0;
        const bd = b.lastMatchDate ? new Date(b.lastMatchDate).getTime() : 0;
        return bd - ad;
      });
  }

  async create(dto: CreateCompetitionDto) {
    return this.prisma.competition.create({
      data: {
        name: dto.name.trim(),
        seasonLabel: dto.seasonLabel?.trim(),
      },
      select: {
        id: true,
        name: true,
        seasonLabel: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll() {
    const competitions = await this.prisma.competition.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        seasonLabel: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const counts = await this.computeMatchStats(
      competitions.map((competition) => competition.id),
    );

    return competitions.map((competition) => ({
      ...competition,
      matchesCount: counts.get(competition.id)?.total ?? 0,
      matchesClosedCount: counts.get(competition.id)?.closed ?? 0,
    }));
  }

  async findOne(id: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        seasonLabel: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!competition) throw new NotFoundException('Competition not found');
    return competition;
  }

  async update(id: string, dto: UpdateCompetitionDto) {
    // fuerza 404 si no existe
    await this.findOne(id);

    return this.prisma.competition.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        seasonLabel: dto.seasonLabel?.trim(),
      },
      select: {
        id: true,
        name: true,
        seasonLabel: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // OJO: si hay matches asociados, Prisma va a fallar por FK
    // (tu schema no tiene onDelete Cascade en Competition->Match)
    // Eso está bien para MVP: primero borrás/limpiás matches o no permitís delete.
    return this.prisma.competition.delete({
      where: { id },
      select: { id: true },
    });
  }

  async setReferees(competitionId: string, refereeIds: string[]) {
    await this.findOne(competitionId);

    return this.prisma.competition.update({
      where: { id: competitionId },
      data: {
        referees: {
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

  async listReferees(competitionId: string) {
    await this.findOne(competitionId);

    const refs = await this.prisma.competitionReferee.findMany({
      where: { competitionId },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
      orderBy: { user: { lastName: "asc" } },
    });

    return refs.map((ref) => ref.user);
  }

  private async computeMatchStats(competitionIds: string[]) {
    if (!competitionIds.length) return new Map<string, { total: number; closed: number }>();

    const matches = await this.prisma.match.findMany({
      where: { competitionId: { in: competitionIds } },
      select: { id: true, competitionId: true },
    });

    const matchIds = matches.map((match) => match.id);
    const clipStats = new Map<string, { total: number; closed: number }>();

    if (matchIds.length) {
      const grouped = await this.prisma.clip.groupBy({
        by: ['matchId', 'status'],
        where: { matchId: { in: matchIds } },
        _count: { _all: true },
      });

      for (const row of grouped) {
        const entry = clipStats.get(row.matchId) ?? { total: 0, closed: 0 };
        entry.total += row._count._all;
        if (row.status === 'CLOSED') entry.closed += row._count._all;
        clipStats.set(row.matchId, entry);
      }
    }

    const counts = new Map<string, { total: number; closed: number }>();

    for (const match of matches) {
      const entry = counts.get(match.competitionId) ?? { total: 0, closed: 0 };
      entry.total += 1;
      const stats = clipStats.get(match.id);
      if (stats && stats.total > 0 && stats.closed === stats.total) {
        entry.closed += 1;
      }
      counts.set(match.competitionId, entry);
    }

    return counts;
  }

  async removeReferee(competitionId: string, userId: string) {
    await this.findOne(competitionId);

    await this.prisma.competitionReferee.deleteMany({
      where: { competitionId, userId },
    });

    return { ok: true };
  }
}
