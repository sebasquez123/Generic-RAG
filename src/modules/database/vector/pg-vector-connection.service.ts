import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { RagConfig } from '~/config';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import { buildSchemaSql } from './schema';

export type SqlExecutor = Pick<PoolClient, 'query'>;

/** Connection concerns only: pool, schema bootstrap, transactions. */
@Injectable()
export class PgVectorConnectionService
  implements OnModuleDestroy, OnModuleInit
{
  private readonly logger = new LoggerService(PgVectorConnectionService.name);
  private readonly pool?: Pool;
  /** pgvector >= 0.8 can keep scanning HNSW until filtered results fill LIMIT. */
  supportsIterativeScan = false;

  constructor(@Inject(RAG_CONFIG) private readonly config: RagConfig) {
    if (config.vector.databaseUrl)
      this.pool = new Pool({
        connectionString: config.vector.databaseUrl,
        max: 10,
      });
  }

  isConfigured(): boolean {
    return Boolean(this.pool);
  }

  async onModuleInit(): Promise<void> {
    // Fail fast: running without storage would accept uploads it cannot keep.
    if (!this.pool)
      throw new Error(
        'Vector storage is not configured. Set RAG_VECTOR_DATABASE_URL or DB_HOST/DB_USER/DB_NAME.',
      );

    for (const statement of buildSchemaSql(this.config.embedding.dimensions))
      await this.pool.query(statement);

    await this.assertEmbeddingDimensions();
    const version = await this.pool.query<{ extversion: string }>(
      "select extversion from pg_extension where extname = 'vector'",
    );
    const [major, minor] = (version.rows[0]?.extversion ?? '0.0')
      .split('.')
      .map(Number);
    this.supportsIterativeScan = major > 0 || minor >= 8;
    this.logger.event('Vector storage ready', {
      pgvector: version.rows[0]?.extversion,
      dimensions: this.config.embedding.dimensions,
      iterativeScan: this.supportsIterativeScan,
    });
  }

  query<T extends QueryResultRow>(text: string, values?: unknown[]) {
    return this.requirePool().query<T>(text, values);
  }

  async transaction<T>(work: (client: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.requirePool().connect();
    try {
      await client.query('begin');
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error('Vector storage is not configured');
    return this.pool;
  }

  /** A dimension change silently breaks similarity search, so refuse to start. */
  private async assertEmbeddingDimensions() {
    const result = await this.requirePool().query<{ dimensions: number }>(
      `select atttypmod as dimensions from pg_attribute
       where attrelid = 'rag_document_chunks'::regclass and attname = 'embedding'`,
    );
    const actual = result.rows[0]?.dimensions;
    const expected = this.config.embedding.dimensions;
    if (actual && actual !== expected)
      throw new Error(
        `rag_document_chunks.embedding is vector(${actual}) but RAG_EMBEDDING_DIMENSIONS=${expected}. ` +
          'Re-create the table (and re-ingest) or restore the previous dimension.',
      );
  }
}
