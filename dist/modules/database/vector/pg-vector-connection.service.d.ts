import { OnModuleDestroy } from '@nestjs/common';
import type { EmbeddedDocumentChunk, RetrievedContext } from '../../../shared/types/semantic-pipeline.type';
export declare class PgVectorConnectionService implements OnModuleDestroy {
    private readonly pool?;
    constructor();
    isConfigured(): boolean;
    searchSimilarContexts(question: string, limit: number): Promise<RetrievedContext[]>;
    storeDocumentChunks(chunks: EmbeddedDocumentChunk[]): Promise<boolean>;
    onModuleDestroy(): Promise<void>;
}
