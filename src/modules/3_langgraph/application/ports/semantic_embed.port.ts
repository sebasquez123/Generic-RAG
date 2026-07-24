import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';

export const SEMANTIC_EMBEDDING_ADAPTER = Symbol('SEMANTIC_EMBEDDING_ADAPTER');

export interface EmbeddingLangChainPort {
    plan(question: string): Promise<string[]>;
    synthesize(question: string, contexts: RetrievedContext[]): Promise<string>;
}
