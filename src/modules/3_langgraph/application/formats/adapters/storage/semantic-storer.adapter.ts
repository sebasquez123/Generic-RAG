import { Injectable } from '@nestjs/common';
import type { StorageLangChainPort } from '../../../ports/semantic_storage.port';
import type { RetrievedContext } from '../../../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class SemanticStorerAdapter implements StorageLangChainPort {
    plan(question: string): Promise<string[]> {
        throw new Error('Method not implemented.');
    }
    synthesize(question: string, contexts: RetrievedContext[]): Promise<string> {
        throw new Error('Method not implemented.');
    }
}