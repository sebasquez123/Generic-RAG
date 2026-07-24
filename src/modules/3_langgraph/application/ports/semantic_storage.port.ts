import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';

export const SEMANTIC_STORAGE_ADAPTER = Symbol('SEMANTIC_STORAGE_ADAPTER');

export interface StorageLangChainPort {
    plan(question: string): Promise<string[]>;
    synthesize(question: string, contexts: RetrievedContext[]): Promise<string>;
}
