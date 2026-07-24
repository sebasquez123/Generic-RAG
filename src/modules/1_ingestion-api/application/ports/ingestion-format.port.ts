import { IngestStructuredDto } from "../../presentation/dto/ingest-structured.dto";
import type { sourceType, FormattedIngestionChunk } from '../../../../shared/types/semantic-pipeline.type';

export const INGESTION_ADAPTERS = Symbol('INGESTION_ADAPTERS');

export interface IngestionFormatInput {
  source: string;
  content?: string;
  file?: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  };
  data?: IngestStructuredDto;
}

export interface IngestionFormatPort {
  readonly type: sourceType;
  format(input: IngestionFormatInput): Promise<FormattedIngestionChunk[]>;
}
