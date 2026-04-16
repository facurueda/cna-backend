import { Test, TestingModule } from '@nestjs/testing';
import { ClipsController } from './clips.controller';
import { ClipsService } from './clips.service';

describe('ClipsController', () => {
  let controller: ClipsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClipsController],
      providers: [
        {
          provide: ClipsService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<ClipsController>(ClipsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
