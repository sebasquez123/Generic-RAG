import { Injectable } from '@nestjs/common';
import type { EmbeddingLangChainPort } from '../../../ports/semantic_embed.port';
import type { RetrievedContext } from '../../../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class SemanticEmbedderAdapter implements EmbeddingLangChainPort {
    plan(question: string): Promise<string[]> {
        throw new Error('Method not implemented.');
    }
    synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
        throw new Error('Method not implemented.');
    }
}