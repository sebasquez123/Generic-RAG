import { DocumentIngestionService } from '../../application/services/document-ingestion.service';
import type { IngestTextDto } from '../dto/ingest-text.dto';
export declare class IngestionController {
    private readonly documentIngestion;
    constructor(documentIngestion: DocumentIngestionService);
    getLineup(): {
        purpose: string;
        ingestionModule: string;
        embeddingModule: string;
        storageModule: string;
    };
    ingestText(body: IngestTextDto): Promise<import("../../../../shared/types/semantic-pipeline.type").IngestionResult>;
}
