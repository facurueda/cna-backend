import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';

const STUDY_MATERIAL_SELECT = {
  id: true,
  url: true,
  documentName: true,
  createdAt: true,
};

@Injectable()
export class StudyMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.studyMaterial.findMany({
      orderBy: { documentName: 'asc' },
      select: STUDY_MATERIAL_SELECT,
    });
  }

  create(dto: CreateStudyMaterialDto) {
    return this.prisma.studyMaterial.create({
      data: dto,
      select: STUDY_MATERIAL_SELECT,
    });
  }
}
