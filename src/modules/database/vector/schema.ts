/**
 * Single source of truth for the RAG schema (bootstrapped on startup).
 *
 * - rag_source_documents: one row per uploaded file (document + system metadata,
 *   original bytes so ingestion can be re-run, status for idempotency).
 * - rag_document_chunks: retrievable pieces with chunk metadata, vectors and a
 *   full-text vector (search_tsv). Rows are only written inside the
 *   transaction that marks the document COMPLETED, so a partially processed
 *   document never becomes searchable.
 *
 * rag_source_documents doubles as the ingestion queue (status QUEUED, lease,
 * run_id fencing token, attempts): no broker is needed for this volume.
 *
 * Statements are idempotent and also upgrade databases created by earlier
 * versions (ALTER ... IF NOT EXISTS), so startup is the migration.
 *
 * The legacy `rag_documents` table (chunks without a parent document) is not
 * used anymore; its rows cannot be traced back to a document.
 */
export function buildSchemaSql(dimensions: number): string[] {
  if (!Number.isInteger(dimensions) || dimensions <= 0 || dimensions > 16000)
    throw new Error(`Invalid embedding dimensions: ${dimensions}`);

  return [
    'create extension if not exists vector',
    `create table if not exists rag_source_documents (
      id uuid primary key,
      namespace text not null,
      name text not null,
      document_type text not null,
      source text not null,
      mime_type text,
      size_bytes integer not null,
      content_hash text not null,
      file_content bytea not null,
      metadata jsonb not null default '{}'::jsonb,
      tags text[] not null default '{}',
      status text not null check (status in ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')),
      stage text,
      progress jsonb not null default '{}'::jsonb,
      error jsonb,
      chunk_count integer not null default 0,
      parser_info jsonb not null default '{}'::jsonb,
      chunking jsonb,
      embedding jsonb,
      ingestion_started_at timestamptz,
      ingested_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint rag_source_documents_namespace_hash_key unique (namespace, content_hash)
    )`,
    // --- ingestion queue (added in 0.3; ADD COLUMN IF NOT EXISTS upgrades old tables)
    'alter table rag_source_documents add column if not exists attempts integer not null default 0',
    'alter table rag_source_documents add column if not exists run_id uuid',
    'alter table rag_source_documents add column if not exists lease_until timestamptz',
    'alter table rag_source_documents add column if not exists available_at timestamptz',
    'alter table rag_source_documents add column if not exists ingest_options jsonb',
    `do $$ begin
      if exists (select 1 from pg_constraint
                 where conname = 'rag_source_documents_status_check'
                   and pg_get_constraintdef(oid) not like '%QUEUED%') then
        alter table rag_source_documents drop constraint rag_source_documents_status_check;
        alter table rag_source_documents add constraint rag_source_documents_status_check
          check (status in ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'));
      end if;
    end $$`,
    `create index if not exists rag_source_documents_queue_idx on rag_source_documents (available_at)
      where status in ('QUEUED', 'PROCESSING')`,
    'create index if not exists rag_source_documents_namespace_status_idx on rag_source_documents (namespace, status, created_at desc)',
    'create index if not exists rag_source_documents_metadata_idx on rag_source_documents using gin (metadata)',
    'create index if not exists rag_source_documents_tags_idx on rag_source_documents using gin (tags)',
    `create table if not exists rag_document_chunks (
      id uuid primary key,
      document_id uuid not null references rag_source_documents (id) on delete cascade,
      namespace text not null,
      chunk_index integer not null,
      chunk_type text not null,
      content text not null check (length(btrim(content)) > 0),
      content_hash text not null,
      page_start integer,
      page_end integer,
      section text,
      sheet text,
      metadata jsonb not null default '{}'::jsonb,
      embedding vector(${dimensions}) not null,
      embedding_version text not null,
      created_at timestamptz not null default now(),
      constraint rag_document_chunks_document_index_key unique (document_id, chunk_index)
    )`,
    'create index if not exists rag_document_chunks_namespace_version_idx on rag_document_chunks (namespace, embedding_version)',
    // HNSW works with incremental inserts; IVFFlat built on an empty table
    // (the previous setup) degrades recall badly.
    'create index if not exists rag_document_chunks_embedding_hnsw_idx on rag_document_chunks using hnsw (embedding vector_cosine_ops)',
    // Full-text side of hybrid search. Text is normalised in the application
    // (lexical.ts: accents folded, identifiers compacted) and indexed with the
    // language-neutral 'simple' config, so no extension is required. Rows
    // ingested before this column existed match lexically after re-ingestion.
    'alter table rag_document_chunks add column if not exists search_tsv tsvector',
    'create index if not exists rag_document_chunks_search_tsv_idx on rag_document_chunks using gin (search_tsv)',
  ];
}
