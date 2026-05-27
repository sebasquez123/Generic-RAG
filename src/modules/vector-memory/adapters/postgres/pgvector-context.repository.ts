import { Injectable } from '@nestjs/common';
import { PgVectorConnectionService } from '../../../database/vector/pg-vector-connection.service';
import type { RetrievedContext } from '../../../RAG/types/rag-shared.type';
import type { VectorContextRepository } from '../../application/ports/vector-context.repository';

@Injectable()
export class PgVectorContextRepository implements VectorContextRepository {
  constructor(private readonly vectorConnection: PgVectorConnectionService) {}

  async retrieve(question: string, limit: number): Promise<RetrievedContext[]> {
    const normalizedLimit = Math.max(1, Math.min(limit, 10));

    if (!this.vectorConnection.isConfigured()) {
      return this.stubContexts(question, normalizedLimit);
    }

    return this.vectorConnection.searchSimilarContexts(
      question,
      normalizedLimit,
    );
  }

  private stubContexts(question: string, limit: number): RetrievedContext[] {
    // Next step: replace fallback data with a pgvector similarity query using
    // embeddings generated during ingestion.
    return Array.from({ length: limit }, (_, index) => ({
      id: `ctx-${index + 1}`,
      source: `pgvector://knowledge-base/${index + 1}`,
      content: `Candidate context ${index + 1} retrieved for "${question}".`,
      score: Number((0.88 - index * 0.04).toFixed(2)),
    }));
  }
}
