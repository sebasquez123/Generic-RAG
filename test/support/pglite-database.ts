import { PGlite, type Transaction } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import type { QueryResultRow } from 'pg';
import { bootstrapSchema } from '~/modules/database/vector/pg-vector-connection.service';

type Queryable = Pick<PGlite, 'query'> | Transaction;

const adapt = (db: Queryable) => ({
  async query<T extends QueryResultRow>(text: string, values?: unknown[]) {
    const result = await db.query<T>(text, values as unknown[]);
    return {
      rows: result.rows,
      rowCount: result.affectedRows ?? result.rows.length,
    };
  },
});

/**
 * Real PostgreSQL (compiled to WASM) with pgvector, used in place of
 * PgVectorConnectionService so tests run the production SQL without Docker:
 * schema bootstrap, SKIP LOCKED claims, fencing, HNSW and full-text search.
 *
 * PGlite is single-connection: statements are serialised, so it proves the SQL
 * and state transitions, not lock contention between real connections (use
 * RAG_TEST_DATABASE_URL with test:int for that).
 */
export class PgliteDatabase {
  supportsIterativeScan = false;

  private constructor(private readonly db: PGlite) {}

  /** `dataDir` persists to disk (used to survive a killed process). */
  static async create(dimensions: number, dataDir?: string) {
    const db = await PGlite.create(dataDir, { extensions: { vector } });
    const database = new PgliteDatabase(db);
    const { supportsIterativeScan } = await bootstrapSchema(
      adapt(db) as never,
      dimensions,
    );
    database.supportsIterativeScan = supportsIterativeScan;
    return database;
  }

  isConfigured() {
    return true;
  }

  query<T extends QueryResultRow>(text: string, values?: unknown[]) {
    return adapt(this.db).query<T>(text, values);
  }

  transaction<T>(work: (client: never) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(adapt(tx) as never));
  }

  close() {
    return this.db.close();
  }
}
