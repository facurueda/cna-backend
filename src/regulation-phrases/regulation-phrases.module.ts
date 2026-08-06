import { Module } from '@nestjs/common';
import { RegulationPhrasesController } from './regulation-phrases.controller';
import { RegulationPhrasesService } from './regulation-phrases.service';

@Module({
  controllers: [RegulationPhrasesController],
  providers: [RegulationPhrasesService],
})
export class RegulationPhrasesModule {}
