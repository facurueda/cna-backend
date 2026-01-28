import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { MatchStatus } from '@prisma/client';

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyMatches(userId: string) {
    return this.prisma.match.findMany({
      where: {
        referees: {
          some: { userId },
        },
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
  }

  async create(dto: CreateMatchDto) {
    // chequeo de competencia existente
    const competition = await this.prisma.competition.findUnique({
      where: { id: dto.competitionId },
      select: { id: true },
    });
    if (!competition) throw new NotFoundException('Competition not found');

    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException('Invalid date');

    return this.prisma.match.create({
      data: {
        competitionId: dto.competitionId,
        teamA: dto.teamA.trim(),
        teamB: dto.teamB.trim(),
        category: dto.category.trim(),
        date,
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
    return this.prisma.match.findMany({
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
    return match;
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
