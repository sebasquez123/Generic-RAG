import { createHash, randomUUID } from 'node:crypto';
import config, { type RagConfig } from '~/config';
import { PgVectorDocumentRepository } from '~/modules/7_storage/adapters/postgres/pgvector-document.repository';
import { PgVectorConnectionService } from '~/modules/database/vector/pg-vector-connection.service';
import {
  ChunkType,
  ChunkingStrategy,
  DocumentType,
  IngestionStage,
  IngestionStatus,
  type EmbeddedChunk,
  type IngestionCompletion,
  type NewDocument,
} from '~/shared/types/semantic-pipeline.type';

/**
 * Runs against a real Postgres + pgvector:
 *   RAG_TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/db npm run test:int
 * Skipped when the variable is not set.
 */
const databaseUrl = process.env.RAG_TEST_DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;
const DIMENSIONS = 4;

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

const completion = (version = 'test:model:4'): IngestionCompletion => ({
  parserInfo: { parser: 'text' },
  chunking: {
    version: 'chunker-v1',
    strategy: ChunkingStrategy.Auto,
    chunkSize: 1200,
    chunkOverlap: 200,
    minChunkChars: 40,
    tableMaxRowsPerChunk: 20,
  },
  embedding: {
    provider: 'test',
    model: 'model',
    dimensions: DIMENSIONS,
    version,
  },
  progress: { chunksTotal: 2, chunksEmbedded: 2 },
});

describeIfDb('PgVectorDocumentRepository (real pgvector)', () => {
  let connection: PgVectorConnectionService;
  let repository: PgVectorDocumentRepository;
  const namespace = `it-${Date.now()}`;

  beforeAll(async () => {
    connection = new PgVectorConnectionService(ragConfig);
    // Isolated schema so the suite never touches real data.
    await connection.query(
      'drop table if exists rag_document_chunks, rag_source_documents cascade',
    );
    await connection.onModuleInit();
    repository = new PgVectorDocumentRepository(connection, ragConfig);
  });

  afterAll(async () => {
    await connection.onModuleDestroy();
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

  it('claims a document for processing only once', async () => {
    const { document } = await repository.create(
      newDocument(namespace, 'claim me'),
    );
    const claims = await Promise.all([
      repository.claimForProcessing(document.id, new Date(Date.now() - 60_000)),
      repository.claimForProcessing(document.id, new Date(Date.now() - 60_000)),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    // A stale PROCESSING run can be reclaimed.
    expect(
      await repository.claimForProcessing(
        document.id,
        new Date(Date.now() + 60_000),
      ),
    ).toBeDefined();
  });

  it('commits chunks atomically and searches with filters, scores and version isolation', async () => {
    const { document } = await repository.create(
      newDocument(namespace, 'searchable'),
    );
    await repository.claimForProcessing(document.id, new Date());
    await repository.commitIngestion(
      document.id,
      [
        chunk(0, [1, 0, 0, 0], { pageStart: 1, pageEnd: 1, section: 'Intro' }),
        chunk(1, [0, 1, 0, 0], {
          chunkType: ChunkType.TableRows,
          sheet: 'Ventas',
          metadata: { row_start: 2, row_end: 5 },
        }),
      ],
      completion(),
    );

    const stored = await repository.findById(document.id);
    expect(stored).toMatchObject({
      status: IngestionStatus.Completed,
      chunkCount: 2,
      embedding: { version: 'test:model:4' },
    });

    const results = await repository.searchSimilarChunks({
      embedding: unit([0.9, 0.1, 0, 0]),
      embeddingVersion: 'test:model:4',
      namespace,
      filters: {},
      limit: 5,
    });
    expect(results[0]).toMatchObject({
      documentId: document.id,
      chunkIndex: 0,
      pageStart: 1,
      section: 'Intro',
      documentName: 'doc.txt',
      tags: ['it'],
      documentMetadata: { year: 2025 },
    });
    expect(results[0].score).toBeGreaterThan(0.99);
    expect(results[0].score).toBeGreaterThan(results[1].score);

    const filtered = await repository.searchSimilarChunks({
      embedding: unit([1, 0, 0, 0]),
      embeddingVersion: 'test:model:4',
      namespace,
      filters: {
        sheets: ['Ventas'],
        metadata: { year: 2025 },
        tags: ['it'],
        documentTypes: [DocumentType.Txt],
      },
      limit: 5,
    });
    expect(filtered.map((result) => result.chunkIndex)).toEqual([1]);
    expect(filtered[0].chunkMetadata).toEqual({ row_start: 2, row_end: 5 });

    const otherVersion = await repository.searchSimilarChunks({
      embedding: unit([1, 0, 0, 0]),
      embeddingVersion: 'other:model:4',
      namespace,
      filters: {},
      limit: 5,
    });
    expect(otherVersion).toEqual([]);
  });

  it('replaces chunks on re-ingestion and rolls back a failed commit', async () => {
    const { document } = await repository.create(
      newDocument(namespace, 'reingest'),
    );
    await repository.commitIngestion(
      document.id,
      [chunk(0, [1, 1, 0, 0]), chunk(1, [0, 0, 1, 0])],
      completion(),
    );
    await repository.commitIngestion(
      document.id,
      [chunk(0, [0, 0, 0, 1], { content: 'v2' })],
      completion(),
    );

    let listed = await repository.listChunks(document.id, 10, 0);
    expect(listed.items.map((item) => item.content)).toEqual(['v2']);

    // Duplicate chunk_index violates the unique constraint -> whole transaction rolls back.
    await expect(
      repository.commitIngestion(
        document.id,
        [chunk(0, [1, 0, 0, 0]), chunk(0, [0, 1, 0, 0])],
        completion(),
      ),
    ).rejects.toThrow();
    listed = await repository.listChunks(document.id, 10, 0);
    expect(listed.items.map((item) => item.content)).toEqual(['v2']);
  });

  it('records failures with their stage and cascades deletes to chunks', async () => {
    const { document } = await repository.create(
      newDocument(namespace, 'to delete'),
    );
    await repository.commitIngestion(
      document.id,
      [chunk(0, [1, 0, 1, 0])],
      completion(),
    );
    await repository.markFailed(
      document.id,
      {
        stage: IngestionStage.Embedding,
        code: 'X',
        message: 'boom',
        at: new Date().toISOString(),
      },
      {},
    );
    expect(await repository.findById(document.id)).toMatchObject({
      status: IngestionStatus.Failed,
      error: { stage: IngestionStage.Embedding, message: 'boom' },
    });

    expect(await repository.delete(document.id)).toBe(true);
    const remaining = await connection.query<{ count: string }>(
      'select count(*) from rag_document_chunks where document_id = $1',
      [document.id],
    );
    expect(Number(remaining.rows[0].count)).toBe(0);
  });

  it('refuses to start when the configured dimension does not match the table', async () => {
    const mismatched = new PgVectorConnectionService({
      ...ragConfig,
      embedding: { ...ragConfig.embedding, dimensions: 8 },
    });
    await expect(mismatched.onModuleInit()).rejects.toThrow('vector(4)');
    await mismatched.onModuleDestroy();
  });
});
