export interface RetrievedContext {
    id: string;
    source: string;
    content: string;
    score: number;
}
export interface EmbeddedDocumentChunk {
    source: string;
    content: string;
    embedding: number[];
}
export interface IngestionResult {
    source: string;
    chunkCount: number;
    embeddedChunks: EmbeddedDocumentChunk[];
    stored: boolean;
}
