export interface RetrievedContext {
  id: string;
  source: string;
  content: string;
  score: number;
}

export interface EmbeddedDocumentChunk {
  source: string;
  content: string;
  // Add metadata next so PDF pages and structured-data field paths survive
  // formatting, embedding, storage, and retrieval without special cases.
  embedding: number[];
}

export interface IngestionResult {
  source: string;
  chunkCount: number;
  embeddedChunks: EmbeddedDocumentChunk[];
  stored: boolean;
}
