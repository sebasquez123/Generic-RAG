import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import {
  PgVectorConnectionService,
  type SqlExecutor,
} from '~/modules/database/vector/pg-vector-connection.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import { toIndexText, toTsQuery } from '~/shared/text/lexical';
import {
  IngestionStatus,
  type CandidateSearchQuery,
  type ChunkType,
  type ChunkingDescriptor,
  type DocumentListQuery,
  type DocumentRecord,
  type DocumentType,
  type EmbeddedChunk,
  type IngestionCompletion,
  type IngestionError,
  type IngestionProgress,
  type IngestionStage,
  type NewDocument,
  type RetrievedContext,
  type SearchCoverage,
  type SearchFilters,
  type StoredChunk,
} from '~/shared/types/semantic-pipeline.type';
import {
  LeaseLostError,
  type DocumentRegistryRepository,
  type DocumentStorageRepository,
  type LeaseUpdate,
} from '../../application/ports/document-storage.repository';

const DOCUMENT_COLUMNS = `
  id, namespace, name, document_type, source, mime_type, size_bytes, content_hash,
  metadata, tags, status, stage, progress, error, chunk_count, parser_info,
  chunking, embedding, attempts, run_id, lease_until, ingest_options,
  ingestion_started_at, ingested_at, created_at, updated_at`;

const CHUNK_COLUMNS = `
  c.id, c.document_id, c.chunk_index, c.chunk_type, c.content, c.content_hash,
  c.page_start, c.page_end, c.section, c.sheet, c.metadata, c.embedding_version, c.created_at`;

const CANDIDATE_COLUMNS = `${CHUNK_COLUMNS},
  d.name as document_name, d.document_type, d.source, d.tags,
  d.metadata as document_metadata, d.content_hash as document_hash,
  d.ingested_at, d.chunking->>'version' as chunking_version`;

const INSERT_BATCH_SIZE = 100;
const BUSY = `(status = '${IngestionStatus.Queued}' or (status = '${IngestionStatus.Processing}' and lease_until > now()))`;

interface DocumentRow {
  id: string;
  namespace: string;
  name: string;
  document_type: DocumentType;
  source: string;
  mime_type: string | null;
  size_bytes: number;
  content_hash: string;
  metadata: Record<string, unknown>;
  tags: string[];
  status: IngestionStatus;
  stage: IngestionStage | null;
  progress: IngestionProgress;
  error: IngestionError | null;
  chunk_count: number;
  parser_info: Record<string, unknown>;
  chunking: DocumentRecord['chunking'] | null;
  embedding: DocumentRecord['embedding'] | null;
  attempts: number;
  run_id: string | null;
  lease_until: Date | null;
  ingest_options: { chunking?: ChunkingDescriptor } | null;
  ingestion_started_at: Date | null;
  ingested_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ChunkRow {
  id: string;
  document_id: string;
  chunk_index: number;
  chunk_type: ChunkType;
  content: string;
  content_hash: string;
  page_start: number | null;
  page_end: number | null;
  section: string | null;
  sheet: string | null;
  metadata: Record<string, unknown>;
  embedding_version: string;
  created_at: Date;
}

interface CandidateRow extends ChunkRow {
  document_name: string;
  document_type: DocumentType;
  source: string;
  tags: string[];
  document_metadata: Record<string, unknown>;
  document_hash: string;
  ingested_at: Date | null;
  chunking_version: string | null;
  score: number;
  lexical_rank: number | null;
}

const toVectorLiteral = (values: number[]) => `[${values.join(',')}]`;
const optional = <T>(value: T | null): T | undefined => value ?? undefined;
const leaseInterval = (param: string) =>
  `now() + (${param}::double precision * interval '1 millisecond')`;

/** Document-level filter SQL, shared by candidate search and coverage counts. */
function documentConditions(
  filters: SearchFilters,
  add: (sql: (param: string) => string, value: unknown) => void,
) {
  if (filters.documentIds?.length)
    add((p) => `d.id = any(${p}::uuid[])`, filters.documentIds);
  if (filters.documentTypes?.length)
    add((p) => `d.document_type = any(${p}::text[])`, filters.documentTypes);
  if (filters.sources?.length)
    add((p) => `d.source = any(${p}::text[])`, filters.sources);
  if (filters.tags?.length) add((p) => `d.tags && ${p}::text[]`, filters.tags);
  if (filters.metadata && Object.keys(filters.metadata).length)
    add((p) => `d.metadata @> ${p}::jsonb`, JSON.stringify(filters.metadata));
}

@Injectable()
export class PgVectorDocumentRepository
  implements DocumentStorageRepository, DocumentRegistryRepository
{
  private readonly logger = new LoggerService(PgVectorDocumentRepository.name);

  constructor(
    private readonly db: PgVectorConnectionService,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  // ------------------------------------------------------------ documents

  async create(document: NewDocument) {
    const inserted = await this.db.query<DocumentRow>(
      `insert into rag_source_documents
        (id, namespace, name, document_type, source, mime_type, size_bytes,
         content_hash, file_content, metadata, tags, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::text[], $12)
       on conflict (namespace, content_hash) do nothing
       returning ${DOCUMENT_COLUMNS}`,
      [
        document.id,
        document.namespace,
        document.name,
        document.documentType,
        document.source,
        document.mimeType ?? null,
        document.sizeBytes,
        document.contentHash,
        document.fileContent,
        JSON.stringify(document.metadata),
        document.tags,
        IngestionStatus.Pending,
      ],
    );
    if (inserted.rows[0])
      return { document: this.toDocument(inserted.rows[0]), created: true };

    const existing = await this.db.query<DocumentRow>(
      `select ${DOCUMENT_COLUMNS} from rag_source_documents
       where namespace = $1 and content_hash = $2`,
      [document.namespace, document.contentHash],
    );
    return { document: this.toDocument(existing.rows[0]), created: false };
  }

  async findById(id: string) {
    const result = await this.db.query<DocumentRow>(
      `select ${DOCUMENT_COLUMNS} from rag_source_documents where id = $1`,
      [id],
    );
    return result.rows[0] ? this.toDocument(result.rows[0]) : undefined;
  }

  async getFileContent(id: string) {
    const result = await this.db.query<{ file_content: Uint8Array }>(
      'select file_content from rag_source_documents where id = $1',
      [id],
    );
    const content = result.rows[0]?.file_content;
    return content ? Buffer.from(content) : undefined;
  }

  async list(query: DocumentListQuery) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.namespace) {
      values.push(query.namespace);
      conditions.push(`namespace = $${values.length}`);
    }
    if (query.namespaces) {
      values.push(query.namespaces);
      conditions.push(`namespace = any($${values.length}::text[])`);
    }
    if (query.status) {
      values.push(query.status);
      conditions.push(`status = $${values.length}`);
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';

    const [rows, count] = await Promise.all([
      this.db.query<DocumentRow>(
        `select ${DOCUMENT_COLUMNS} from rag_source_documents ${where}
         order by created_at desc
         limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, query.limit, query.offset],
      ),
      this.db.query<{ total: string }>(
        `select count(*) as total from rag_source_documents ${where}`,
        values,
      ),
    ]);
    return {
      items: rows.rows.map((row) => this.toDocument(row)),
      total: Number(count.rows[0]?.total ?? 0),
    };
  }

  async delete(id: string) {
    const result = await this.db.query(
      'delete from rag_source_documents where id = $1',
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // ------------------------------------------------------ ingestion queue

  async enqueue(id: string, chunking: ChunkingDescriptor) {
    const result = await this.db.query<DocumentRow>(
      `update rag_source_documents
       set status = $2, ingest_options = $3::jsonb, attempts = 0, available_at = now(),
           run_id = null, lease_until = null, stage = null, error = null,
           progress = '{}'::jsonb, updated_at = now()
       where id = $1 and not ${BUSY}
       returning ${DOCUMENT_COLUMNS}`,
      [id, IngestionStatus.Queued, JSON.stringify({ chunking })],
    );
    return result.rows[0] ? this.toDocument(result.rows[0]) : undefined;
  }

  async countQueued() {
    const result = await this.db.query<{ total: string }>(
      'select count(*) as total from rag_source_documents where status = $1',
      [IngestionStatus.Queued],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async claimNext(runId: string, leaseMs: number, maxAttempts: number) {
    const result = await this.db.query<DocumentRow>(
      `update rag_source_documents
       set status = $2, run_id = $1, attempts = attempts + 1,
           lease_until = ${leaseInterval('$3')}, ingestion_started_at = now(),
           stage = null, progress = '{}'::jsonb, updated_at = now()
       where id = (
         select id from rag_source_documents
         where attempts < $4
           and ((status = $5 and available_at <= now())
             or (status = $2 and lease_until < now()))
         order by available_at nulls first, created_at
         for update skip locked
         limit 1)
       returning ${DOCUMENT_COLUMNS}`,
      [
        runId,
        IngestionStatus.Processing,
        leaseMs,
        maxAttempts,
        IngestionStatus.Queued,
      ],
    );
    return result.rows[0] ? this.toDocument(result.rows[0]) : undefined;
  }

  async failAbandoned(maxAttempts: number) {
    const result = await this.db.query<{ id: string }>(
      `update rag_source_documents
       set status = $1, run_id = null, lease_until = null, updated_at = now(),
           error = jsonb_build_object(
             'stage', coalesce(stage, 'VALIDATION'),
             'code', 'INGESTION_ABANDONED',
             'message', 'Ingestion stopped responding ' || attempts ||
                        ' time(s) (worker crash or resource exhaustion); giving up',
             'at', now())
       where status = $2 and lease_until < now() and attempts >= $3
       returning id`,
      [IngestionStatus.Failed, IngestionStatus.Processing, maxAttempts],
    );
    return result.rows.map((row) => row.id);
  }

  async renewLease(
    id: string,
    runId: string,
    leaseMs: number,
    update: LeaseUpdate = {},
  ) {
    const result = await this.db.query(
      `update rag_source_documents
       set lease_until = ${leaseInterval('$3')}, updated_at = now(),
           stage = coalesce($4, stage),
           progress = coalesce($5::jsonb, progress)
       where id = $1 and run_id = $2 and status = $6`,
      [
        id,
        runId,
        leaseMs,
        update.stage ?? null,
        update.progress ? JSON.stringify(update.progress) : null,
        IngestionStatus.Processing,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async requeue(
    id: string,
    runId: string,
    error: IngestionError,
    delayMs: number,
  ) {
    const result = await this.db.query(
      `update rag_source_documents
       set status = $3, run_id = null, lease_until = null, stage = null,
           error = $4::jsonb, available_at = ${leaseInterval('$5')}, updated_at = now()
       where id = $1 and run_id = $2 and status = $6`,
      [
        id,
        runId,
        IngestionStatus.Queued,
        JSON.stringify(error),
        delayMs,
        IngestionStatus.Processing,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markFailed(
    id: string,
    runId: string,
    error: IngestionError,
    progress: IngestionProgress,
  ) {
    // Fenced: a run that lost its lease can no longer overwrite the new owner.
    const result = await this.db.query(
      `update rag_source_documents
       set status = $3, stage = $4, error = $5::jsonb, progress = $6::jsonb,
           run_id = null, lease_until = null, updated_at = now()
       where id = $1 and run_id = $2 and status = $7`,
      [
        id,
        runId,
        IngestionStatus.Failed,
        error.stage,
        JSON.stringify(error),
        JSON.stringify(progress),
        IngestionStatus.Processing,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async recordCompletedProgress(id: string, progress: IngestionProgress) {
    await this.db.query(
      `update rag_source_documents set progress = $2::jsonb
       where id = $1 and status = $3`,
      [id, JSON.stringify(progress), IngestionStatus.Completed],
    );
  }

  async coverage(
    namespace: string,
    filters: SearchFilters,
    embeddingVersion: string,
  ): Promise<SearchCoverage> {
    const values: unknown[] = [namespace, embeddingVersion];
    const conditions = ['d.namespace = $1'];
    documentConditions(filters, (sql, value) => {
      values.push(value);
      conditions.push(sql(`$${values.length}`));
    });

    const searchable = `d.chunk_count > 0 and d.embedding->>'version' = $2`;
    const running = `d.status in ('${IngestionStatus.Queued}', '${IngestionStatus.Processing}')`;
    const result = await this.db.query<Record<keyof SearchCoverage, string>>(
      `select
         count(*) as "documentsTotal",
         count(*) filter (where ${searchable}) as "searchable",
         count(*) filter (where d.status = '${IngestionStatus.Pending}' and d.chunk_count = 0) as "pending",
         count(*) filter (where ${running} and not (${searchable})) as "inProgress",
         count(*) filter (where d.status = '${IngestionStatus.Failed}' and d.chunk_count = 0) as "failed",
         count(*) filter (where d.chunk_count > 0 and not ${running}
                            and d.embedding->>'version' is distinct from $2) as "requiresReindex"
       from rag_source_documents d
       where ${conditions.join(' and ')}`,
      values,
    );
    const row = result.rows[0];
    return {
      documentsTotal: Number(row?.documentsTotal ?? 0),
      searchable: Number(row?.searchable ?? 0),
      pending: Number(row?.pending ?? 0),
      inProgress: Number(row?.inProgress ?? 0),
      failed: Number(row?.failed ?? 0),
      requiresReindex: Number(row?.requiresReindex ?? 0),
    };
  }

  // --------------------------------------------------------------- chunks

  async commitIngestion(
    documentId: string,
    runId: string,
    chunks: EmbeddedChunk[],
    completion: IngestionCompletion,
  ) {
    await this.db.transaction(async (tx) => {
      // Fencing: only the run that holds the lease may publish its chunks.
      const locked = await tx.query<{ namespace: string }>(
        `select namespace from rag_source_documents
         where id = $1 and run_id = $2 and status = $3 for update`,
        [documentId, runId, IngestionStatus.Processing],
      );
      const namespace = locked.rows[0]?.namespace;
      if (!namespace)
        throw new LeaseLostError(
          `Run ${runId} no longer owns document ${documentId} (lease expired or document deleted)`,
        );

      await tx.query('delete from rag_document_chunks where document_id = $1', [
        documentId,
      ]);
      for (let start = 0; start < chunks.length; start += INSERT_BATCH_SIZE)
        await this.insertChunks(
          tx,
          documentId,
          namespace,
          chunks.slice(start, start + INSERT_BATCH_SIZE),
          completion.embedding.version,
        );

      await tx.query(
        `update rag_source_documents
         set status = $2, stage = null, error = null, chunk_count = $3,
             parser_info = $4::jsonb, chunking = $5::jsonb, embedding = $6::jsonb,
             progress = $7::jsonb, run_id = null, lease_until = null,
             ingested_at = now(), updated_at = now()
         where id = $1`,
        [
          documentId,
          IngestionStatus.Completed,
          chunks.length,
          JSON.stringify(completion.parserInfo),
          JSON.stringify(completion.chunking),
          JSON.stringify(completion.embedding),
          JSON.stringify(completion.progress),
        ],
      );
    });
  }

  private async insertChunks(
    tx: SqlExecutor,
    documentId: string,
    namespace: string,
    chunks: EmbeddedChunk[],
    embeddingVersion: string,
  ) {
    const values: unknown[] = [];
    const rows = chunks.map((chunk) => {
      const param = (value: unknown, cast = '') => {
        values.push(value);
        return `$${values.length}${cast}`;
      };
      return `(${[
        param(randomUUID()),
        param(documentId),
        param(namespace),
        param(chunk.chunkIndex),
        param(chunk.chunkType),
        param(chunk.content),
        param(chunk.contentHash),
        param(chunk.pageStart ?? null),
        param(chunk.pageEnd ?? null),
        param(chunk.section ?? null),
        param(chunk.sheet ?? null),
        param(JSON.stringify(chunk.metadata), '::jsonb'),
        param(toVectorLiteral(chunk.embedding), '::vector'),
        param(embeddingVersion),
        `to_tsvector('simple', ${param(chunk.searchText ?? toIndexText(chunk.content))})`,
      ].join(', ')})`;
    });

    await tx.query(
      `insert into rag_document_chunks
        (id, document_id, namespace, chunk_index, chunk_type, content, content_hash,
         page_start, page_end, section, sheet, metadata, embedding, embedding_version,
         search_tsv)
       values ${rows.join(', ')}`,
      values,
    );
  }

  /**
   * Vector candidates and, when lexical terms are given, full-text candidates
   * (GIN index on search_tsv). Both lists share the same filters and every
   * candidate carries both signals, so fusion and evidence rules stay in the
   * application layer.
   */
  async searchCandidates(
    query: CandidateSearchQuery,
  ): Promise<RetrievedContext[]> {
    const values: unknown[] = [
      toVectorLiteral(query.embedding),
      query.namespace,
      query.embeddingVersion,
    ];
    const conditions = ['c.namespace = $2', 'c.embedding_version = $3'];
    const add = (sql: (param: string) => string, value: unknown) => {
      values.push(value);
      conditions.push(sql(`$${values.length}`));
    };
    documentConditions(query.filters, add);
    if (query.filters.sheets?.length)
      add((p) => `c.sheet = any(${p}::text[])`, query.filters.sheets);

    values.push(query.limit);
    const limit = `$${values.length}`;
    const where = conditions.join(' and ');

    const vectorSql = `
      select ${CANDIDATE_COLUMNS},
             1 - (c.embedding <=> $1::vector) as score, null::real as lexical_rank
      from rag_document_chunks c
      join rag_source_documents d on d.id = c.document_id
      where ${where}
      order by c.embedding <=> $1::vector
      limit ${limit}`;

    const tsQuery = query.lexicalTerms?.length
      ? toTsQuery(query.lexicalTerms)
      : undefined;
    const lexicalValues = tsQuery ? [...values, tsQuery] : [];
    const lexicalSql = `
      select ${CANDIDATE_COLUMNS},
             1 - (c.embedding <=> $1::vector) as score,
             ts_rank_cd(c.search_tsv, q.query) as lexical_rank
      from rag_document_chunks c
      join rag_source_documents d on d.id = c.document_id
      cross join to_tsquery('simple', $${values.length + 1}) as q(query)
      where ${where} and c.search_tsv @@ q.query
      order by lexical_rank desc, c.id
      limit ${limit}`;

    const startedAt = Date.now();
    const { vectorRows, lexicalRows } = await this.db.transaction(
      async (tx) => {
        const efSearch = Math.max(this.config.vector.hnswEfSearch, query.limit);
        await tx.query(`set local hnsw.ef_search = ${Math.floor(efSearch)}`);
        // A pathological query must not hold a pool connection indefinitely.
        await tx.query(
          `set local statement_timeout = ${Math.floor(this.config.search.statementTimeoutMs)}`,
        );
        if (this.db.supportsIterativeScan)
          await tx.query('set local hnsw.iterative_scan = relaxed_order');
        const vector = (await tx.query<CandidateRow>(vectorSql, values)).rows;
        const lexical = tsQuery
          ? (await tx.query<CandidateRow>(lexicalSql, lexicalValues)).rows
          : [];
        return { vectorRows: vector, lexicalRows: lexical };
      },
    );
    this.logger.debug(
      `Candidate search returned ${vectorRows.length} vector + ${lexicalRows.length} lexical rows in ${Date.now() - startedAt} ms`,
    );

    const byId = new Map<string, RetrievedContext>();
    for (const row of vectorRows) byId.set(row.id, this.toContext(row));
    for (const row of lexicalRows) {
      const existing = byId.get(row.id);
      if (existing) existing.lexicalRank = Number(row.lexical_rank);
      else byId.set(row.id, this.toContext(row));
    }
    return [...byId.values()];
  }

  async listChunks(documentId: string, limit: number, offset: number) {
    const [rows, count] = await Promise.all([
      this.db.query<ChunkRow>(
        `select ${CHUNK_COLUMNS} from rag_document_chunks c
         where c.document_id = $1 order by c.chunk_index limit $2 offset $3`,
        [documentId, limit, offset],
      ),
      this.db.query<{ total: string }>(
        'select count(*) as total from rag_document_chunks where document_id = $1',
        [documentId],
      ),
    ]);
    return {
      items: rows.rows.map(
        (row): StoredChunk => ({
          id: row.id,
          documentId: row.document_id,
          chunkIndex: row.chunk_index,
          chunkType: row.chunk_type,
          content: row.content,
          pageStart: optional(row.page_start),
          pageEnd: optional(row.page_end),
          section: optional(row.section),
          sheet: optional(row.sheet),
          metadata: row.metadata,
          embeddingVersion: row.embedding_version,
          createdAt: row.created_at,
        }),
      ),
      total: Number(count.rows[0]?.total ?? 0),
    };
  }

  private toContext(row: CandidateRow): RetrievedContext {
    return {
      chunkId: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      documentType: row.document_type,
      source: row.source,
      tags: row.tags,
      documentMetadata: row.document_metadata,
      chunkIndex: row.chunk_index,
      chunkType: row.chunk_type,
      content: row.content,
      contentHash: row.content_hash,
      pageStart: optional(row.page_start),
      pageEnd: optional(row.page_end),
      section: optional(row.section),
      sheet: optional(row.sheet),
      chunkMetadata: row.metadata,
      createdAt: row.created_at,
      score: Number(row.score),
      lexicalRank:
        row.lexical_rank === null ? undefined : Number(row.lexical_rank),
      documentHash: row.document_hash,
      ingestedAt: optional(row.ingested_at),
      chunkingVersion: optional(row.chunking_version),
      embeddingVersion: row.embedding_version,
    };
  }

  private toDocument(row: DocumentRow): DocumentRecord {
    return {
      id: row.id,
      namespace: row.namespace,
      name: row.name,
      documentType: row.document_type,
      source: row.source,
      mimeType: optional(row.mime_type),
      sizeBytes: row.size_bytes,
      contentHash: row.content_hash,
      metadata: row.metadata,
      tags: row.tags,
      status: row.status,
      stage: optional(row.stage),
      progress: row.progress,
      error: optional(row.error),
      chunkCount: row.chunk_count,
      parserInfo: row.parser_info,
      chunking: optional(row.chunking),
      embedding: optional(row.embedding),
      attempts: row.attempts ?? 0,
      runId: optional(row.run_id),
      leaseUntil: optional(row.lease_until),
      requestedChunking: row.ingest_options?.chunking,
      ingestionStartedAt: optional(row.ingestion_started_at),
      ingestedAt: optional(row.ingested_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
