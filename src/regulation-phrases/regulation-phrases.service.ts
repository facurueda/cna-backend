import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRegulationPhraseDto } from './dto/create-regulation-phrase.dto';
import { UpdateRegulationPhraseDto } from './dto/update-regulation-phrase.dto';

const PHRASE_SELECT = {
  id: true,
  text: true,
  answer: true,
  createdAt: true,
  updatedAt: true,
};

@Injectable()
export class RegulationPhrasesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.regulationPhrase.findMany({
      orderBy: { createdAt: 'desc' },
      select: PHRASE_SELECT,
    });
  }

  async findOne(id: string) {
    const phrase = await this.prisma.regulationPhrase.findUnique({
      where: { id },
      select: PHRASE_SELECT,
    });
    if (!phrase) throw new NotFoundException('Regulation phrase not found');
    return phrase;
  }

  create(dto: CreateRegulationPhraseDto) {
    return this.prisma.regulationPhrase.create({
      data: {
        text: dto.text.trim(),
        answer: dto.answer.trim(),
      },
      select: PHRASE_SELECT,
    });
  }

  async update(id: string, dto: UpdateRegulationPhraseDto) {
    await this.findOne(id);
    return this.prisma.regulationPhrase.update({
      where: { id },
      data: {
        ...(dto.text !== undefined && { text: dto.text.trim() }),
        ...(dto.answer !== undefined && { answer: dto.answer.trim() }),
      },
      select: PHRASE_SELECT,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.regulationPhrase.delete({ where: { id } });
    return { id };
  }
}
