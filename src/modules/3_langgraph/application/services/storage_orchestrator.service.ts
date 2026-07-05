import { Inject, Injectable } from '@nestjs/common';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
import { type StorageLangChainPort, SEMANTIC_STORAGE_ADAPTER } from '../ports/semantic_storage.port';

@Injectable()
export class StorageOrchestratorService {
    constructor(
        @Inject(SEMANTIC_STORAGE_ADAPTER) private readonly graphAdapter: StorageLangChainPort,
    ) { }

    plan(question: string): Promise<string[]> {
        return this.graphAdapter.plan(question);
    }

    synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
        return this.graphAdapter.synthesize(question, contexts);
    }
}
