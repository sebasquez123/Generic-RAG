import type {
  DocumentType,
  ParsedDocument,
} from '~/shared/types/semantic-pipeline.type';

export const INGESTION_ADAPTERS = Symbol('INGESTION_ADAPTERS');

export interface IngestionFileInput {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
}

/**
 * One adapter per file format. Adapters parse and normalise only; chunking,
 * embedding and persistence stay in the pipeline so every format is treated
 * the same way downstream.
 */
export interface IngestionFormatPort {
  readonly type: DocumentType;
  parse(input: IngestionFileInput): Promise<ParsedDocument>;
}
