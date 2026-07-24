import { Inject, Injectable } from '@nestjs/common';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
import { type EmbeddingLangChainPort, SEMANTIC_EMBEDDING_ADAPTER } from '../ports/semantic_embed.port';

@Injectable()
export class EmbeddingOrchestratorService {
    constructor(
        @Inject(SEMANTIC_EMBEDDING_ADAPTER) private readonly graphAdapter: EmbeddingLangChainPort,
    ) { }

    plan(question: string): Promise<string[]> {
        return this.graphAdapter.plan(question);
    }

    synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
        return this.graphAdapter.synthesize(question, contexts);
    }
}
