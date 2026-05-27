import { Module } from '@nestjs/common';
import { EmbeddingService } from './application/embedding.service';

@Module({
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
