import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import type { RetrievedContext } from '../../RAG/types/rag-shared.type';

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

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
