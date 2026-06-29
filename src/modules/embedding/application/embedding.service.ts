import { Injectable } from '@nestjs/common';
import { GeminiInfrastructureService } from '../../../infrastructure/gemini/gemini.service';
import type { EmbeddingVector } from '../domain/types/embedding-vector.type';

@Injectable()
export class EmbeddingService {
  constructor(private readonly gemini: GeminiInfrastructureService) {}

  embed(input: string): Promise<EmbeddingVector> {
    return this.gemini.embedText(input);
  }
}
