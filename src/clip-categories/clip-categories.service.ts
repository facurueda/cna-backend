import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ClipCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.clipCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  }
}
