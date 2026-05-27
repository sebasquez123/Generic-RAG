import type { EmbeddedDocumentChunk, IngestionResult } from '../../../../shared/types/semantic-pipeline.type';
export declare class FormatterService {
    formatIngestionResult(input: {
        source: string;
        embeddedChunks: EmbeddedDocumentChunk[];
        stored: boolean;
    }): IngestionResult;
}
