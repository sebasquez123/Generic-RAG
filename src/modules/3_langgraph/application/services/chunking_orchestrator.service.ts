import { Inject, Injectable } from '@nestjs/common';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
import { type ChunkingLangChainPort, SEMANTIC_CHUNKING_ADAPTER } from '../ports/semantic_chunk.port';

@Injectable()
export class ChunkingOrchestratorService {
  constructor(
    @Inject(SEMANTIC_CHUNKING_ADAPTER) private readonly graphAdapter: ChunkingLangChainPort,
  ) { }

  plan(question: string): Promise<string[]> {
    return this.graphAdapter.plan(question);
  }

  synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
    return this.graphAdapter.synthesize(question, contexts);
  }
}
