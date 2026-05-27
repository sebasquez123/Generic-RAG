import { EmbeddingService } from '../../../embedding/application/embedding.service';
import { StorageService } from '../../../storage/application/services/storage.service';
import type { IngestionResult } from '../../../../shared/types/semantic-pipeline.type';
export declare class DocumentIngestionService {
    private readonly embedding;
    private readonly storage;
    constructor(embedding: EmbeddingService, storage: StorageService);
    ingestText(input: {
        source: string;
        content: string;
    }): Promise<IngestionResult>;
    private chunk;
}
