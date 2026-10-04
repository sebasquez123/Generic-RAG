import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import {
  PgVectorConnectionService,
  type SqlExecutor,
} from '~/modules/database/vector/pg-vector-connection.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import {
  IngestionStatus,
  type ChunkType,
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
  type StoredChunk,
  type VectorSearchQuery,
} from '~/shared/types/semantic-pipeline.type';
import type {
  DocumentRegistryRepository,
  DocumentStorageRepository,
} from '../../application/ports/document-storage.repository';

const DOCUMENT_COLUMNS = `
  id, namespace, name, document_type, source, mime_type, size_bytes, content_hash,
  metadata, tags, status, stage, progress, error, chunk_count, parser_info,
  chunking, embedding, ingestion_started_at, ingested_at, created_at, updated_at`;

const CHUNK_COLUMNS = `
  c.id, c.document_id, c.chunk_index, c.chunk_type, c.content, c.content_hash,
  c.page_start, c.page_end, c.section, c.sheet, c.metadata, c.embedding_version, c.created_at`;

const INSERT_BATCH_SIZE = 100;

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

interface SearchRow extends ChunkRow {
  document_name: string;
  document_type: DocumentType;
  source: string;
  tags: string[];
  document_metadata: Record<string, unknown>;
  score: number;
}

const toVectorLiteral = (values: number[]) => `[${values.join(',')}]`;
const optional = <T>(value: T | null): T | undefined => value ?? undefined;

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
    const result = await this.db.query<{ file_content: Buffer }>(
      'select file_content from rag_source_documents where id = $1',
      [id],
    );
    return result.rows[0]?.file_content;
  }

  async list(query: DocumentListQuery) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.namespace) {
      values.push(query.namespace);
      conditions.push(`namespace = $${values.length}`);
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

  async claimForProcessing(id: string, staleBefore: Date) {
    const result = await this.db.query<DocumentRow>(
      `update rag_source_documents
       set status = $2, stage = null, error = null, progress = '{}'::jsonb,
           ingestion_started_at = now(), updated_at = now()
       where id = $1 and (status <> $2 or updated_at < $3)
       returning ${DOCUMENT_COLUMNS}`,
      [id, IngestionStatus.Processing, staleBefore],
    );
    return result.rows[0] ? this.toDocument(result.rows[0]) : undefined;
  }

  async updateProgress(
    id: string,
    stage: IngestionStage,
    progress: IngestionProgress,
  ) {
    await this.db.query(
      `update rag_source_documents
       set stage = $2, progress = $3::jsonb, updated_at = now()
       where id = $1 and status = $4`,
      [id, stage, JSON.stringify(progress), IngestionStatus.Processing],
    );
  }

  async markFailed(
    id: string,
    error: IngestionError,
    progress: IngestionProgress,
  ) {
    await this.db.query(
      `update rag_source_documents
       set status = $2, stage = $3, error = $4::jsonb, progress = $5::jsonb, updated_at = now()
       where id = $1`,
      [
        id,
        IngestionStatus.Failed,
        error.stage,
        JSON.stringify(error),
        JSON.stringify(progress),
      ],
    );
  }

  // --------------------------------------------------------------- chunks

  async commitIngestion(
    documentId: string,
    chunks: EmbeddedChunk[],
    completion: IngestionCompletion,
  ) {
    await this.db.transaction(async (tx) => {
      const locked = await tx.query<{ namespace: string }>(
        'select namespace from rag_source_documents where id = $1 for update',
        [documentId],
      );
      const namespace = locked.rows[0]?.namespace;
      if (!namespace)
        throw new Error(`Document ${documentId} was deleted during ingestion`);

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
             progress = $7::jsonb, ingested_at = now(), updated_at = now()
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
      const offset = values.length;
      values.push(
        randomUUID(),
        documentId,
        namespace,
        chunk.chunkIndex,
        chunk.chunkType,
        chunk.content,
        chunk.contentHash,
        chunk.pageStart ?? null,
        chunk.pageEnd ?? null,
        chunk.section ?? null,
        chunk.sheet ?? null,
        JSON.stringify(chunk.metadata),
        toVectorLiteral(chunk.embedding),
        embeddingVersion,
      );
      const params = Array.from(
        { length: 14 },
        (_, index) => `$${offset + index + 1}`,
      );
      params[11] += '::jsonb';
      params[12] += '::vector';
      return `(${params.join(', ')})`;
    });

    await tx.query(
      `insert into rag_document_chunks
        (id, document_id, namespace, chunk_index, chunk_type, content, content_hash,
         page_start, page_end, section, sheet, metadata, embedding, embedding_version)
       values ${rows.join(', ')}`,
      values,
    );
  }

  async searchSimilarChunks(
    query: VectorSearchQuery,
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

    const { filters } = query;
    if (filters.documentIds?.length)
      add((p) => `c.document_id = any(${p}::uuid[])`, filters.documentIds);
    if (filters.documentTypes?.length)
      add((p) => `d.document_type = any(${p}::text[])`, filters.documentTypes);
    if (filters.sources?.length)
      add((p) => `d.source = any(${p}::text[])`, filters.sources);
    if (filters.tags?.length)
      add((p) => `d.tags && ${p}::text[]`, filters.tags);
    if (filters.sheets?.length)
      add((p) => `c.sheet = any(${p}::text[])`, filters.sheets);
    if (filters.metadata && Object.keys(filters.metadata).length)
      add((p) => `d.metadata @> ${p}::jsonb`, JSON.stringify(filters.metadata));

    values.push(query.limit);
    const sql = `
      select ${CHUNK_COLUMNS},
             d.name as document_name, d.document_type, d.source, d.tags,
             d.metadata as document_metadata,
             1 - (c.embedding <=> $1::vector) as score
      from rag_document_chunks c
      join rag_source_documents d on d.id = c.document_id
      where ${conditions.join(' and ')}
      order by c.embedding <=> $1::vector
      limit $${values.length}`;

    const startedAt = Date.now();
    const rows = await this.db.transaction(async (tx) => {
      const efSearch = Math.max(this.config.vector.hnswEfSearch, query.limit);
      await tx.query(`set local hnsw.ef_search = ${Math.floor(efSearch)}`);
      if (this.db.supportsIterativeScan)
        await tx.query('set local hnsw.iterative_scan = relaxed_order');
      return (await tx.query<SearchRow>(sql, values)).rows;
    });
    this.logger.debug(
      `Vector search returned ${rows.length} rows in ${Date.now() - startedAt} ms`,
    );

    return rows.map((row) => ({
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
    }));
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
      ingestionStartedAt: optional(row.ingestion_started_at),
      ingestedAt: optional(row.ingested_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
