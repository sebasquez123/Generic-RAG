import { createHash, randomUUID } from 'node:crypto';
import config, { type RagConfig } from '~/config';
import { PgVectorDocumentRepository } from '~/modules/7_storage/adapters/postgres/pgvector-document.repository';
import { LeaseLostError } from '~/modules/7_storage/application/ports/document-storage.repository';
import {
  PgVectorConnectionService,
  bootstrapSchema,
} from '~/modules/database/vector/pg-vector-connection.service';
import { queryTerms, toIndexText } from '~/shared/text/lexical';
import {
  ChunkType,
  ChunkingStrategy,
  DocumentType,
  IngestionStage,
  IngestionStatus,
  type ChunkingDescriptor,
  type EmbeddedChunk,
  type IngestionCompletion,
  type NewDocument,
} from '~/shared/types/semantic-pipeline.type';
import { PgliteDatabase } from './support/pglite-database';

/**
 * Production SQL of the repository: queue (SKIP LOCKED claim, lease, fencing,
 * abandonment), atomic commit, hybrid candidate search and coverage.
 *
 * Runs on PGlite (real PostgreSQL + pgvector in WASM) by default. Point it at
 * a real server to also exercise concurrent connections:
 *   RAG_TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/db npm run test:int
 * (that mode drops and recreates the RAG tables: use a disposable database).
 */
const databaseUrl = process.env.RAG_TEST_DATABASE_URL;
const DIMENSIONS = 4;
const VERSION = 'test:model:4';

const ragConfig = {
  ...config.rag,
  vector: { databaseUrl, hnswEfSearch: 40 },
  embedding: { ...config.rag.embedding, dimensions: DIMENSIONS },
} as RagConfig;

const unit = (values: number[]) => {
  const norm = Math.hypot(...values);
  return values.map((value) => value / norm);
};

const newDocument = (
  namespace: string,
  content: string,
  overrides: Partial<NewDocument> = {},
): NewDocument => ({
  id: randomUUID(),
  namespace,
  name: 'doc.txt',
  documentType: DocumentType.Txt,
  source: 'tests/doc.txt',
  sizeBytes: content.length,
  contentHash: createHash('sha256').update(content).digest('hex'),
  fileContent: Buffer.from(content),
  metadata: { year: 2025 },
  tags: ['it'],
  ...overrides,
});

const chunk = (
  index: number,
  embedding: number[],
  overrides: Partial<EmbeddedChunk> = {},
): EmbeddedChunk => ({
  chunkIndex: index,
  chunkType: ChunkType.Text,
  content: `chunk ${index}`,
  contentHash: `hash-${index}`,
  metadata: { heading_path: ['A'] },
  embedding: unit(embedding),
  ...overrides,
});

const chunking: ChunkingDescriptor = {
  version: 'chunker-v2',
  strategy: ChunkingStrategy.Auto,
  chunkSize: 1200,
  chunkOverlap: 200,
  minChunkChars: 40,
  tableMaxRowsPerChunk: 20,
};

const completion = (version = VERSION): IngestionCompletion => ({
  parserInfo: { parser: 'text' },
  chunking,
  embedding: {
    provider: 'test',
    model: 'model',
    dimensions: DIMENSIONS,
    version,
  },
  progress: { chunksTotal: 2, chunksEmbedded: 2 },
});

const failure = (message = 'boom') => ({
  stage: IngestionStage.Embedding,
  code: 'X',
  message,
  at: new Date().toISOString(),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe(`PgVectorDocumentRepository (${databaseUrl ? 'PostgreSQL' : 'PGlite'})`, () => {
  let connection: PgVectorConnectionService | PgliteDatabase;
  let repository: PgVectorDocumentRepository;
  const namespace = `it-${Date.now()}`;

  /** Queues the document and claims it as `runId` (what a worker does). */
  const claim = async (id: string, runId = randomUUID(), leaseMs = 60_000) => {
    await repository.enqueue(id, chunking);
    const claimed = await repository.claimNext(runId, leaseMs, 3);
    expect(claimed?.id).toBe(id);
    return runId;
  };

  beforeAll(async () => {
    if (databaseUrl) {
      const pg = new PgVectorConnectionService(ragConfig);
      await pg.query(
        'drop table if exists rag_document_chunks, rag_source_documents cascade',
      );
      await pg.onModuleInit();
      connection = pg;
    } else {
      connection = await PgliteDatabase.create(DIMENSIONS);
    }
    repository = new PgVectorDocumentRepository(
      connection as PgVectorConnectionService,
      ragConfig,
    );
  });

  afterAll(async () => {
    if (connection instanceof PgliteDatabase) await connection.close();
    else await connection.onModuleDestroy();
  });

  // Each test leaves nothing due in the queue for the next one.
  afterEach(async () => {
    await connection.query(
      `update rag_source_documents set status = 'PENDING', run_id = null, lease_until = null
       where status in ('QUEUED', 'PROCESSING')`,
    );
  });

  it('creates documents idempotently per namespace and content hash', async () => {
    const first = await repository.create(newDocument(namespace, 'same bytes'));
    const second = await repository.create(
      newDocument(namespace, 'same bytes'),
    );
    const otherTenant = await repository.create(
      newDocument(`${namespace}-b`, 'same bytes'),
    );

    expect(first.created).toBe(true);
    expect(second).toMatchObject({
      created: false,
      document: { id: first.document.id },
    });
    expect(otherTenant.created).toBe(true);
    expect(await repository.getFileContent(first.document.id)).toEqual(
      Buffer.from('same bytes'),
    );
  });

  describe('ingestion queue', () => {
    it('enqueues once and hands a document to exactly one claimer', async () => {
      const { document } = await repository.create(
        newDocument(namespace, 'claim me'),
      );
      expect(await repository.enqueue(document.id, chunking)).toMatchObject({
        status: IngestionStatus.Queued,
        requestedChunking: { version: 'chunker-v2' },
      });
      // Already queued: a second request is refused (the API answers 409).
      expect(await repository.enqueue(document.id, chunking)).toBeUndefined();
      expect(await repository.countQueued()).toBe(1);

      const claims = await Promise.all([
        repository.claimNext(randomUUID(), 60_000, 3),
        repository.claimNext(randomUUID(), 60_000, 3),
      ]);
      const winners = claims.filter(Boolean);
      expect(winners).toHaveLength(1);
      expect(winners[0]).toMatchObject({
        id: document.id,
        status: IngestionStatus.Processing,
        attempts: 1,
      });
      expect(winners[0]!.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
      // A live run cannot be re-queued over.
      expect(await repository.enqueue(document.id, chunking)).toBeUndefined();
    });

    it('reclaims an expired lease and fences the run that lost it', async () => {
      const { document } = await repository.create(
        newDocument(namespace, 'crash'),
      );
      const deadRun = await claim(document.id, randomUUID(), 50);
      await sleep(80); // the "dead" worker never renews its lease

      const newRun = randomUUID();
      const reclaimed = await repository.claimNext(newRun, 60_000, 3);
      expect(reclaimed).toMatchObject({
        id: document.id,
        runId: newRun,
        attempts: 2,
      });

      // Everything the dead run tries now is rejected.
      expect(await repository.renewLease(document.id, deadRun, 60_000)).toBe(
        false,
      );
      expect(
        await repository.markFailed(document.id, deadRun, failure(), {}),
      ).toBe(false);
      expect(await repository.requeue(document.id, deadRun, failure(), 0)).toBe(
        false,
      );
      await expect(
        repository.commitIngestion(
          document.id,
          deadRun,
          [chunk(0, [1, 0, 0, 0])],
          completion(),
        ),
      ).rejects.toBeInstanceOf(LeaseLostError);

      // The owner commits normally.
      expect(await repository.renewLease(document.id, newRun, 60_000)).toBe(
        true,
      );
      await repository.commitIngestion(
        document.id,
        newRun,
        [chunk(0, [1, 0, 0, 0])],
        completion(),
      );
      expect(await repository.findById(document.id)).toMatchObject({
        status: IngestionStatus.Completed,
        chunkCount: 1,
        runId: undefined,
        leaseUntil: undefined,
      });
    });

    it('re-queues transient failures with a delay and abandons runs out of attempts', async () => {
      const { document } = await repository.create(
        newDocument(namespace, 'retry'),
      );
      const run = await claim(document.id);
      expect(
        await repository.requeue(document.id, run, failure('429'), 60_000),
      ).toBe(true);
      expect(await repository.findById(document.id)).toMatchObject({
        status: IngestionStatus.Queued,
        attempts: 1,
        error: { message: '429' },
      });
      // Not due yet.
      expect(
        await repository.claimNext(randomUUID(), 60_000, 3),
      ).toBeUndefined();

      // A run that keeps dying (e.g. the file exhausts memory) is failed, not retried forever.
      await connection.query(
        `update rag_source_documents set status = 'PROCESSING', attempts = 3,
           lease_until = now() - interval '1 second' where id = $1`,
        [document.id],
      );
      expect(
        await repository.claimNext(randomUUID(), 60_000, 3),
      ).toBeUndefined();
      expect(await repository.failAbandoned(3)).toEqual([document.id]);
      expect(await repository.findById(document.id)).toMatchObject({
        status: IngestionStatus.Failed,
        error: { code: 'INGESTION_ABANDONED' },
      });
    });
  });

  describe('chunks and search', () => {
    it('commits atomically and searches with filters, scores and version isolation', async () => {
      const { document } = await repository.create(
        newDocument(namespace, 'searchable'),
      );
      const run = await claim(document.id);
      await repository.commitIngestion(
        document.id,
        run,
        [
          chunk(0, [1, 0, 0, 0], {
            pageStart: 1,
            pageEnd: 1,
            section: 'Intro',
          }),
          chunk(1, [0, 1, 0, 0], {
            chunkType: ChunkType.TableRows,
            sheet: 'Ventas',
            metadata: { row_start: 2, row_end: 5 },
          }),
        ],
        completion(),
      );

      const search = (overrides = {}) =>
        repository.searchCandidates({
          embedding: unit([0.9, 0.1, 0, 0]),
          embeddingVersion: VERSION,
          namespace,
          filters: { documentIds: [document.id] },
          limit: 5,
          ...overrides,
        });

      const results = await search();
      expect(results[0]).toMatchObject({
        documentId: document.id,
        chunkIndex: 0,
        pageStart: 1,
        section: 'Intro',
        documentName: 'doc.txt',
        documentHash: document.contentHash,
        chunkingVersion: 'chunker-v2',
        embeddingVersion: VERSION,
        tags: ['it'],
        documentMetadata: { year: 2025 },
      });
      expect(results[0].ingestedAt).toBeInstanceOf(Date);
      expect(results[0].score).toBeGreaterThan(0.99);
      expect(results[0].score).toBeGreaterThan(results[1].score);

      const filtered = await search({
        embedding: unit([1, 0, 0, 0]),
        filters: {
          documentIds: [document.id],
          sheets: ['Ventas'],
          metadata: { year: 2025 },
          tags: ['it'],
          documentTypes: [DocumentType.Txt],
        },
      });
      expect(filtered.map((result) => result.chunkIndex)).toEqual([1]);

      expect(await search({ embeddingVersion: 'other:model:4' })).toEqual([]);
    });

    it('adds full-text candidates that vector ranking alone would miss', async () => {
      const { document } = await repository.create(
        newDocument(namespace, 'invoices'),
      );
      const run = await claim(document.id);
      const rows = Array.from({ length: 30 }, (_, index) => {
        const code = `FV-2025-${String(index + 1).padStart(5, '0')}`;
        return chunk(index, [0, 0, 1, index / 30], {
          content: `Row ${index + 2}: Factura: ${code} | Cliente: Cliente ${index}`,
          contentHash: `inv-${index}`,
          searchText: toIndexText(
            `Document: facturas.xlsx\n\nRow ${index + 2}: Factura: ${code}`,
          ),
        });
      });
      await repository.commitIngestion(document.id, run, rows, completion());

      const terms = queryTerms('factura FV-2025-00017').terms;
      const candidates = await repository.searchCandidates({
        embedding: unit([1, 0, 0, 0]), // semantically unrelated on purpose
        embeddingVersion: VERSION,
        namespace,
        filters: { documentIds: [document.id] },
        limit: 3,
        lexicalTerms: terms,
      });
      const target = candidates.find((c) =>
        c.content.includes('FV-2025-00017'),
      );
      expect(target?.lexicalRank).toBeGreaterThan(0);
      // Without lexical terms only the 3 nearest vectors come back.
      const vectorOnly = await repository.searchCandidates({
        embedding: unit([1, 0, 0, 0]),
        embeddingVersion: VERSION,
        namespace,
        filters: { documentIds: [document.id] },
        limit: 3,
      });
      expect(vectorOnly.every((c) => c.lexicalRank === undefined)).toBe(true);
    });

    it('replaces chunks on re-ingestion and rolls back a failed commit', async () => {
      const { document } = await repository.create(
        newDocument(namespace, 'reingest'),
      );
      await repository.commitIngestion(
        document.id,
        await claim(document.id),
        [chunk(0, [1, 1, 0, 0]), chunk(1, [0, 0, 1, 0])],
        completion(),
      );
      await repository.commitIngestion(
        document.id,
        await claim(document.id),
        [chunk(0, [0, 0, 0, 1], { content: 'v2' })],
        completion(),
      );
      let listed = await repository.listChunks(document.id, 10, 0);
      expect(listed.items.map((item) => item.content)).toEqual(['v2']);

      // Duplicate chunk_index violates the unique constraint -> whole transaction rolls back.
      await expect(
        repository.commitIngestion(
          document.id,
          await claim(document.id),
          [chunk(0, [1, 0, 0, 0]), chunk(0, [0, 1, 0, 0])],
          completion(),
        ),
      ).rejects.toThrow();
      listed = await repository.listChunks(document.id, 10, 0);
      expect(listed.items.map((item) => item.content)).toEqual(['v2']);
    });

    it('reports coverage: what a search can and cannot see', async () => {
      const ns = `${namespace}-coverage`;
      const searchable = (await repository.create(newDocument(ns, 'a')))
        .document;
      await repository.commitIngestion(
        searchable.id,
        await claim(searchable.id),
        [chunk(0, [1, 0, 0, 0])],
        completion(),
      );
      const stale = (await repository.create(newDocument(ns, 'b'))).document;
      await repository.commitIngestion(
        stale.id,
        await claim(stale.id),
        [chunk(0, [1, 0, 0, 0])],
        completion('old:model:4'),
      );
      await repository.create(newDocument(ns, 'c')); // pending
      const failed = (await repository.create(newDocument(ns, 'd'))).document;
      await repository.markFailed(
        failed.id,
        await claim(failed.id),
        failure(),
        {},
      );
      const queued = (await repository.create(newDocument(ns, 'e'))).document;
      await repository.enqueue(queued.id, chunking);

      expect(await repository.coverage(ns, {}, VERSION)).toEqual({
        documentsTotal: 5,
        searchable: 1,
        pending: 1,
        inProgress: 1,
        failed: 1,
        requiresReindex: 1,
      });
      expect(
        await repository.coverage(
          ns,
          { documentIds: [searchable.id] },
          VERSION,
        ),
      ).toMatchObject({ documentsTotal: 1, searchable: 1 });
    });

    it('cascades deletes to chunks', async () => {
      const { document } = await repository.create(
        newDocument(namespace, 'to delete'),
      );
      await repository.commitIngestion(
        document.id,
        await claim(document.id),
        [chunk(0, [1, 0, 1, 0])],
        completion(),
      );
      expect(await repository.delete(document.id)).toBe(true);
      const remaining = await connection.query<{ count: string }>(
        'select count(*) from rag_document_chunks where document_id = $1',
        [document.id],
      );
      expect(Number(remaining.rows[0].count)).toBe(0);
    });
  });

  it('upgrades a database created by the previous schema (startup is the migration)', async () => {
    if (databaseUrl) return; // covered by the PGlite run; never rebuild a shared DB here
    const legacy = await PgliteDatabase.create(DIMENSIONS);
    await legacy.query('drop table rag_document_chunks, rag_source_documents');
    await legacy.query(`create table rag_source_documents (
      id uuid primary key, namespace text not null, name text not null,
      document_type text not null, source text not null, mime_type text,
      size_bytes integer not null, content_hash text not null, file_content bytea not null,
      metadata jsonb not null default '{}'::jsonb, tags text[] not null default '{}',
      status text not null check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
      stage text, progress jsonb not null default '{}'::jsonb, error jsonb,
      chunk_count integer not null default 0, parser_info jsonb not null default '{}'::jsonb,
      chunking jsonb, embedding jsonb, ingestion_started_at timestamptz, ingested_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      constraint rag_source_documents_namespace_hash_key unique (namespace, content_hash))`);
    // Re-running the bootstrap on the legacy table must add the queue columns
    // and widen the status constraint.
    await bootstrapSchema(legacy as never, DIMENSIONS);
    const repo = new PgVectorDocumentRepository(legacy as never, ragConfig);
    const { document } = await repo.create(newDocument('legacy', 'x'));
    expect(await repo.enqueue(document.id, chunking)).toMatchObject({
      status: IngestionStatus.Queued,
    });
    await legacy.close();
  });
});
