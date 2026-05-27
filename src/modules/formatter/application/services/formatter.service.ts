import { Injectable } from '@nestjs/common';
import type {
  EmbeddedDocumentChunk,
  IngestionResult,
} from '../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class FormatterService {
  // MVP next step: add formatPdfBlocks and formatStructuredRecord methods.
  // They should produce the same chunk shape so embedding/storage stay simple.
  formatIngestionResult(input: {
    source: string;
    embeddedChunks: EmbeddedDocumentChunk[];
    stored: boolean;
  }): IngestionResult {
    return {
      source: input.source,
      chunkCount: input.embeddedChunks.length,
      embeddedChunks: input.embeddedChunks,
      stored: input.stored,
    };
  }
}
