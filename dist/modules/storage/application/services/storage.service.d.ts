import type { EmbeddedDocumentChunk, RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
import type { DocumentStorageRepository } from '../ports/document-storage.repository';
export declare class StorageService {
    private readonly repository;
    constructor(repository: DocumentStorageRepository);
    searchSimilarContexts(question: string, limit: number): Promise<RetrievedContext[]>;
    storeDocumentChunks(chunks: EmbeddedDocumentChunk[]): Promise<boolean>;
}
