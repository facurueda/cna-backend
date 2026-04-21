import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

const GROUP_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
};

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
};

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.group.findMany({
      orderBy: { name: 'asc' },
      select: {
        ...GROUP_SELECT,
        _count: { select: { members: true } },
      },
    });
  }

  async findOne(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      select: GROUP_SELECT,
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  create(dto: CreateGroupDto) {
    return this.prisma.group.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
      },
      select: GROUP_SELECT,
    });
  }

  async update(id: string, dto: UpdateGroupDto) {
    await this.findOne(id);
    return this.prisma.group.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && {
          description: dto.description.trim(),
        }),
      },
      select: GROUP_SELECT,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.group.delete({ where: { id } });
    return { id };
  }

  async listMembers(groupId: string) {
    await this.findOne(groupId);
    const members = await this.prisma.userGroup.findMany({
      where: { groupId },
      include: { user: { select: USER_SELECT } },
      orderBy: { user: { lastName: 'asc' } },
    });
    return members.map((m) => m.user);
  }

  async addMembers(groupId: string, userIds: string[]) {
    await this.findOne(groupId);
    await this.prisma.userGroup.createMany({
      data: userIds.map((userId) => ({ groupId, userId })),
      skipDuplicates: true,
    });
    return this.listMembers(groupId);
  }

  async removeMember(groupId: string, userId: string) {
    await this.findOne(groupId);
    await this.prisma.userGroup.delete({
      where: { groupId_userId: { groupId, userId } },
    });
    return { groupId, userId };
  }
}
