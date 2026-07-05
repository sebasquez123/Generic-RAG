import { Injectable } from '@nestjs/common';
import { PgVectorConnectionService } from '../../../database/vector/pg-vector-connection.service';
import type { DocumentStorageRepository } from '../../application/ports/document-storage.repository';
import type {
  EmbeddedDocumentChunk,
  RetrievedContext,
} from '../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class PgVectorDocumentRepository implements DocumentStorageRepository {
  constructor(private readonly vectorConnection: PgVectorConnectionService) {}

  // Retrieval remains read-only for the MVP; ingestion writes should go through
  // storeDocumentChunks after LangGraph completes formatting and embedding.
  searchSimilarContexts(
    question: string,
    limit: number,
  ): Promise<RetrievedContext[]> {
    return this.vectorConnection.searchSimilarContexts(question, limit);
  }

  storeDocumentChunks(chunks: EmbeddedDocumentChunk[]): Promise<boolean> {
    return this.vectorConnection.storeDocumentChunks(chunks);
  }
}
