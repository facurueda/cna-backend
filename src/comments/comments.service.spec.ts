import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatsService } from '../users/user-stats.service';
import { CommentsService } from './comments.service';

describe('CommentsService', () => {
  let service: CommentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: UserStatsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
