import { PgVectorConnectionService } from '../../../database/vector/pg-vector-connection.service';
import type { DocumentStorageRepository } from '../../application/ports/document-storage.repository';
import type { EmbeddedDocumentChunk, RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
export declare class PgVectorDocumentRepository implements DocumentStorageRepository {
    private readonly vectorConnection;
    constructor(vectorConnection: PgVectorConnectionService);
    searchSimilarContexts(question: string, limit: number): Promise<RetrievedContext[]>;
    storeDocumentChunks(chunks: EmbeddedDocumentChunk[]): Promise<boolean>;
}
