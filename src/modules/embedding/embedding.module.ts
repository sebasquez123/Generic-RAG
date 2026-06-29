import { Module } from '@nestjs/common';
import { GeminiInfrastructureService } from '../../infrastructure/gemini/gemini.service';
import { EmbeddingService } from './application/embedding.service';

@Module({
  providers: [GeminiInfrastructureService, EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
