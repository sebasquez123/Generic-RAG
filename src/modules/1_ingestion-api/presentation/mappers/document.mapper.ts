import type {
  ChunkingOptions,
  DocumentRecord,
  StoredChunk,
} from '~/shared/types/semantic-pipeline.type';
import type { ChunkingOverridesInput } from '../validators/documents.schema';

/** External contract is snake_case; internal models stay camelCase. */
export function toDocumentResponse(
  document: DocumentRecord,
  requiresReindex = false,
) {
  return {
    id: document.id,
    namespace: document.namespace,
    name: document.name,
    document_type: document.documentType,
    source: document.source,
    mime_type: document.mimeType ?? null,
    size_bytes: document.sizeBytes,
    content_hash: document.contentHash,
    metadata: document.metadata,
    tags: document.tags,
    status: document.status,
    stage: document.stage ?? null,
    progress: {
      chunks_total: document.progress?.chunksTotal ?? null,
      chunks_embedded: document.progress?.chunksEmbedded ?? null,
      timings_ms: document.progress?.timingsMs ?? {},
    },
    error: document.error ?? null,
    // Worker claims of the current ingestion request (crash recoveries included).
    attempts: document.attempts,
    chunk_count: document.chunkCount,
    requires_reindex: requiresReindex,
    system: {
      parser: document.parserInfo,
      chunking: document.chunking ?? null,
      embedding: document.embedding ?? null,
    },
    ingestion_started_at: document.ingestionStartedAt?.toISOString() ?? null,
    ingested_at: document.ingestedAt?.toISOString() ?? null,
    created_at: document.createdAt.toISOString(),
    updated_at: document.updatedAt.toISOString(),
  };
}

export function toChunkResponse(chunk: StoredChunk) {
  return {
    id: chunk.id,
    document_id: chunk.documentId,
    chunk_index: chunk.chunkIndex,
    chunk_type: chunk.chunkType,
    content: chunk.content,
    page_start: chunk.pageStart ?? null,
    page_end: chunk.pageEnd ?? null,
    section: chunk.section ?? null,
    sheet: chunk.sheet ?? null,
    metadata: chunk.metadata,
    embedding_version: chunk.embeddingVersion,
    created_at: chunk.createdAt.toISOString(),
  };
}

export function toChunkingOverrides(
  input?: ChunkingOverridesInput,
): Partial<ChunkingOptions> | undefined {
  if (!input) return undefined;
  return {
    strategy: input.strategy,
    chunkSize: input.chunk_size,
    chunkOverlap: input.chunk_overlap,
    tableMaxRowsPerChunk: input.table_max_rows_per_chunk,
  };
}
