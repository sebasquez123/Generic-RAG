import { Injectable } from '@nestjs/common';
import { EmbeddingService } from '../../../embedding/application/embedding.service';
import { StorageService } from '../../../storage/application/services/storage.service';
import type {
  EmbeddedDocumentChunk,
  IngestionResult,
} from '../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class DocumentIngestionService {
  constructor(
    private readonly embedding: EmbeddingService,
    private readonly storage: StorageService,
  ) {}

  async ingestText(input: {
    source: string;
    content: string;
  }): Promise<IngestionResult> {
    // MVP next step: make this method the LangGraph execution target after
    // PDF parsing or structured-data normalization has produced plain chunks.
    const chunks = this.chunk(input.content);
    const embeddedChunks = chunks.map<EmbeddedDocumentChunk>((content) => ({
      source: input.source,
      content,
      embedding: this.embedding.embed(content),
    }));
    const stored = await this.storage.storeDocumentChunks(embeddedChunks);

    return {
      source: input.source,
      chunkCount: embeddedChunks.length,
      embeddedChunks,
      stored,
    };
  }

  private chunk(content: string): string[] {
    // Replace paragraph splitting with a formatter-owned chunking strategy that
    // preserves PDF page metadata and structured-data field paths.
    return content
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);
  }
}
