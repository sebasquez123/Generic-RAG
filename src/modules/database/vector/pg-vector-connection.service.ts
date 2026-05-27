import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import type {
  EmbeddedDocumentChunk,
  RetrievedContext,
} from '../../../shared/types/semantic-pipeline.type';

@Injectable()
export class PgVectorConnectionService implements OnModuleDestroy {
  private readonly pool?: Pool;

  constructor() {
    const connectionString = process.env.RAG_VECTOR_DATABASE_URL;

    if (connectionString) {
      this.pool = new Pool({ connectionString });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.pool);
  }

  async searchSimilarContexts(
    question: string,
    limit: number,
  ): Promise<RetrievedContext[]> {
    if (!this.pool) {
      return [];
    }

    const result = await this.pool.query<RetrievedContext>(
      `
        select
          id::text,
          source,
          content,
          0::float as score
        from rag_documents
        where content ilike $1
        limit $2
      `,
      [`%${question}%`, limit],
    );

    return result.rows;
  }

  async storeDocumentChunks(chunks: EmbeddedDocumentChunk[]): Promise<boolean> {
    if (!this.pool || chunks.length === 0) {
      return false;
    }

    // MVP schema expectation: rag_documents(source, content, embedding vector).
    // Add metadata columns next for PDF page numbers and structured field paths.
    for (const chunk of chunks) {
      await this.pool.query(
        `
          insert into rag_documents (source, content, embedding)
          values ($1, $2, $3::vector)
        `,
        [chunk.source, chunk.content, `[${chunk.embedding.join(',')}]`],
      );
    }

    return true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
