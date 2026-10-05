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

/** Schema bootstrap shared by the service and the PGlite-backed test database. */
export async function bootstrapSchema(
  db: Pick<SqlExecutor, 'query'>,
  dimensions: number,
): Promise<{ pgvector?: string; supportsIterativeScan: boolean }> {
  for (const statement of buildSchemaSql(dimensions)) await db.query(statement);

  const result = await db.query<{ dimensions: number }>(
    `select atttypmod as dimensions from pg_attribute
     where attrelid = 'rag_document_chunks'::regclass and attname = 'embedding'`,
  );
  const actual = result.rows[0]?.dimensions;
  // A dimension change silently breaks similarity search, so refuse to start.
  if (actual && actual !== dimensions)
    throw new Error(
      `rag_document_chunks.embedding is vector(${actual}) but RAG_EMBEDDING_DIMENSIONS=${dimensions}. ` +
        'Re-create the table (and re-ingest) or restore the previous dimension.',
    );

  const version = await db.query<{ extversion: string }>(
    "select extversion from pg_extension where extname = 'vector'",
  );
  const pgvector = version.rows[0]?.extversion;
  const [major, minor] = (pgvector ?? '0.0').split('.').map(Number);
  // pgvector >= 0.8 can keep scanning HNSW until filtered results fill LIMIT.
  return { pgvector, supportsIterativeScan: major > 0 || minor >= 8 };
}

/** Connection concerns only: pool, schema bootstrap, transactions. */
@Injectable()
export class PgVectorConnectionService
  implements OnModuleDestroy, OnModuleInit
{
  private readonly logger = new LoggerService(PgVectorConnectionService.name);
  private readonly pool?: Pool;
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

    const { pgvector, supportsIterativeScan } = await bootstrapSchema(
      this.pool,
      this.config.embedding.dimensions,
    );
    this.supportsIterativeScan = supportsIterativeScan;
    this.logger.event('Vector storage ready', {
      pgvector,
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
}
