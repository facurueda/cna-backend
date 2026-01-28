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
            matches: {
              some: {
                referees: { some: { userId: user.id } },
              },
            },
          },
      include: {
        _count: { select: { matches: true } },
        matches: {
          where: isAdmin
            ? undefined
            : { referees: { some: { userId: user.id } } },
          orderBy: { date: 'desc' },
          take: 1,
          select: { date: true },
        },
      },
    });

    return competitions
      .map((c) => ({
        id: c.id,
        name: c.name,
        seasonLabel: c.seasonLabel,
        matchesCount: c._count.matches, // total matches (admin y general)
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
    return this.prisma.competition.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        seasonLabel: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
}
