import { OnModuleDestroy } from '@nestjs/common';
import type { RetrievedContext } from '../../shared/types/rag-shared.type';
export declare class PgVectorConnectionService implements OnModuleDestroy {
    private readonly pool?;
    constructor();
    isConfigured(): boolean;
    searchSimilarContexts(question: string, limit: number): Promise<RetrievedContext[]>;
    onModuleDestroy(): Promise<void>;
}
