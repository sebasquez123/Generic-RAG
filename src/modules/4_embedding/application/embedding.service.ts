import { Injectable } from '@nestjs/common';
import { GeminiLlmService } from "~/modules/5_LLM's/application/services/gemini-llm.service";
import type { EmbeddingVector } from '../domain/types/embedding-vector.type';

@Injectable()
export class EmbeddingService {
  constructor(private readonly gemini: GeminiLlmService) { }

  embed(input: string): Promise<EmbeddingVector> {
    return this.gemini.embedText(input);
  }
}
