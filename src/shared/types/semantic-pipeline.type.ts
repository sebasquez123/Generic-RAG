export enum sourceType {
  Text = 'text',
  Pdf = 'pdf',
  Structured = 'structured',
}

export interface RetrievedContext {
  id: string;
  source: string;
  content: string;
  score: number;
}

export interface EmbeddedDocumentChunk extends FormattedIngestionChunk {
  embedding: number[];
}

export interface IngestionResult {
  source: string;
  type: sourceType;
  chunkCount: number;
  embeddedChunks: EmbeddedDocumentChunk[];
  stored: boolean;
}

export interface FormattedIngestionChunk {
  source: string;
  content: string;
  metadata?: Record<string, unknown>;
}