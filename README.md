# GenRag MVP
![Proyect preview](assets/cover1.png)
![Proyect preview](assets/cover2.png)

NestJS microservice that turns documents into retrievable, citable evidence for an **external** LLM server.

```text
Server-side UI (/ui) ─┐
External client ──────┴─> Ingestion API ─> VALIDATION ─> PARSING (+normalisation) ─> CHUNKING ─> EMBEDDING (Gemini) ─> STORAGE (pgvector)

External LLM server ─> POST /search ─> query embedding ─> filtered vector search ─> threshold / dedupe / top-K ─> chunks + metadata + citations
```

The service never generates the final answer. It returns evidence (content, score, citation and metadata) and says explicitly when there is none (`found: false`), so the LLM server can ground and cite its answer.

## Quick start

```bash
cp .env.example .env          # fill DB_*, GEMINI_API_KEY, ...
docker compose up -d          # Postgres + pgvector + API
open http://localhost:${APP_PORT}/ui                 # ingestion console
open http://localhost:${APP_PORT}/client-api/swagger # API reference
```

Without Docker: `npm install --legacy-peer-deps && npm run build && node dist/main.js` (or `npm run dev`) (needs a Postgres with the `vector` extension).

## HTTP API (prefix `/api/v1`)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/documents` | Upload (multipart `file` + optional `namespace`, `source`, `document_type`, `metadata` JSON, `tags`, `ingest=true`). Deduplicated by SHA-256 per namespace: re-uploading returns `200` + `duplicate: true` and the existing id. |
| `POST` | `/documents/{id}/ingest` | Run the pipeline. `202` + background by default (poll `GET /documents/{id}`); `{"wait": true}` runs synchronously. Skipped (`started: false, reason: "already_ingested"`) when chunking/embedding versions are unchanged, unless `{"force": true}`. Optional `chunking: {strategy, chunk_size, chunk_overlap, table_max_rows_per_chunk}`. |
| `GET` | `/documents/{id}` | Status, current stage, progress (`chunks_embedded/chunks_total`), error with stage, system metadata, `requires_reindex`. |
| `GET` | `/documents?namespace=&status=&limit=&offset=` | List. |
| `GET` | `/documents/{id}/chunks` | Stored chunks, for traceability. |
| `DELETE` | `/documents/{id}` | Deletes the document and its chunks (`409` while processing). |
| `POST` | `/search` | Retrieval API for external servers. |

Legacy endpoints (`POST /ingestion/text|pdf|structured`, `POST /query/fetch`) still work and delegate to the same use cases.

### Search contract

```json
POST /api/v1/search
{
  "query": "¿Cuál fue la facturación de 2025?",
  "top_k": 5,
  "min_score": 0.6,
  "namespace": "default",
  "order_by": "score",
  "filters": {
    "document_ids": [], "document_types": ["xlsx"], "sources": [],
    "tags": ["finanzas"], "sheets": ["Facturación"], "metadata": { "year": 2025 }
  }
}
```

```json
{
  "query": "¿Cuál fue la facturación de 2025?",
  "namespace": "default",
  "found": true,
  "message": null,
  "results": [
    {
      "rank": 1,
      "chunk_id": "…", "document_id": "…",
      "content": "Row 5: Año: 2025 | Región: Norte | Facturación USD: 1250000 | …",
      "score": 0.8123,
      "citation": "ventas.xlsx, sheet \"Facturación\", rows 4-6, section \"Reporte de facturación anual\"",
      "metadata": {
        "document_name": "ventas.xlsx", "document_type": "xlsx", "source": "finanzas/ventas.xlsx", "tags": ["finanzas"],
        "page_start": null, "page_end": null, "section": "Reporte de facturación anual", "sheet": "Facturación",
        "chunk_index": 1, "chunk_type": "table_rows", "created_at": "…",
        "chunk": { "row_start": 4, "row_end": 6, "columns": ["Año", "Región", "Facturación USD", "Fecha cierre"] },
        "document": { "year": 2025 }
      }
    }
  ],
  "retrieval": { "top_k": 5, "min_score": 0.6, "candidates": 20, "below_threshold": 17, "duplicates_removed": 0, "embedding_version": "gemini:gemini-embedding-001:768", "took_ms": 212 }
}
```

- Results below `min_score` are dropped; the list is **never padded** to `top_k`.
- `found: false` means there is no sufficient evidence; the LLM should not answer from this knowledge base.
- `order_by: "document"` returns the same results grouped by document in reading order (`rank` keeps relevance).
- Namespaces are isolated (tenant boundary).

## Pipeline design

### Parsing (one adapter per format, `1_ingestion-api/application/formats`)

| Format | Parser | What is preserved |
| --- | --- | --- |
| PDF | `pdf-parse` (pdf.js) | Page per block, paragraphs rebuilt from visual lines, de-hyphenation, heading detection (numbered / ALL CAPS), repeated headers/footers and page numbers removed, document title/author. Image-only PDFs fail with `PDF_NO_TEXT` (no OCR). |
| XLSX | `exceljs` | Workbook → sheets → tables split by blank rows; header row detection (generated `Column A…` otherwise), title rows as table caption, formulas as their result, dates as ISO, empty columns dropped. |
| TXT/MD | built-in | Encoding (UTF-8 BOM, UTF-16, strict UTF-8, fallback Windows-1252), markdown and heuristic headings, paragraphs. |
| JSON | built-in | Arrays of objects → tables; nested objects → `field.path: value` lines (legacy `/ingestion/structured`). |

### Chunking (`2_chunker`, version `chunker-v1`)

- **Prose (`recursive`)**: section-aware (a chunk never mixes two sections); units split on paragraph → line → sentence → word boundaries, greedily packed up to `chunk_size`, with sentence-aligned `chunk_overlap`. A tiny trailing chunk is merged into the previous one. Every chunk carries `page_start/page_end`, `section` and `heading_path`.
- **Tables (`table`)**: one `table_summary` chunk per table (sheet, caption, columns, row range) plus `table_rows` chunks of up to `table_max_rows_per_chunk` rows, each row rendered as `Row N: Header: value | …` so every chunk is self-describing.
- `auto` (default) picks per block. Empty/punctuation-only chunks and exact duplicates are dropped.
- The text sent to the embedding model is `Document / Sheet / Section` context + content; the **stored** content stays clean for quoting.

### Metadata model

| Layer | Where | Examples |
| --- | --- | --- |
| Document metadata | `rag_source_documents.metadata`, `tags` | caller-provided facts (`year`, `area`…), filterable with `filters.metadata` / `filters.tags` |
| Chunk metadata | `rag_document_chunks` columns + `metadata` | `page_start/end`, `section`, `sheet`, `chunk_index`, `chunk_type`, `row_start/end`, `columns`, `heading_path` |
| System metadata | `rag_source_documents` | `content_hash`, `status`, `stage`, `error{stage,code,message}`, `progress`, `parser_info` (pages, encoding, sheets, warnings), `chunking{version,…}`, `embedding{provider,model,dimensions,version}` |

Document fields are joined at query time instead of being copied into every chunk.

### Embeddings (`4_embedding`)

`EmbeddingService` (batching, empty-input guard, dimension and finiteness checks) depends on `EmbeddingProviderPort`. Adapters:

- `gemini` (default): REST `batchEmbedContents` through the existing `HttpClientService`; `RETRIEVAL_DOCUMENT` vs `RETRIEVAL_QUERY` task types, `outputDimensionality`, up to 100 inputs per request, exponential backoff with jitter on 408/429/5xx/network errors honouring `Retry-After`; 4xx errors fail fast without leaking the key.
- `hashing`: deterministic lexical stand-in used by tests and offline smoke runs. **Not semantic — never use it in real environments.**

The embedding **version** (`provider:model:dimensions`) is stored per chunk. Search only compares vectors of the current version, and documents embedded with another version report `requires_reindex: true`. Changing provider/model means: change config → re-ingest with `force: true`.

### Storage (`7_storage` + `database/vector`)

Postgres + pgvector (existing stack). Schema is bootstrapped on startup from `src/modules/database/vector/schema.ts`:

- `rag_source_documents` (unique `namespace + content_hash`, original bytes kept so ingestion can be re-run).
- `rag_document_chunks` (FK with cascade delete, unique `document_id + chunk_index`, `vector(RAG_EMBEDDING_DIMENSIONS)`, HNSW cosine index).
- Chunk replacement and the `COMPLETED` transition happen in **one transaction**: a failed run never leaves partial, searchable data; a failed re-ingestion keeps the previous version.
- Startup fails if the table dimension differs from `RAG_EMBEDDING_DIMENSIONS`.
- Search sets `hnsw.ef_search` and, on pgvector ≥ 0.8, `hnsw.iterative_scan` so metadata filters do not starve top-K.
- The legacy `rag_documents` table is no longer used (its rows cannot be traced to a document). Drop it once nothing reads it.

### Idempotency and states

`PENDING → PROCESSING → COMPLETED | FAILED`. The move to `PROCESSING` is an atomic conditional update (concurrent ingest requests get `409`); a run stuck in `PROCESSING` longer than `RAG_PROCESSING_STALE_MS` (e.g. after a crash) can be claimed again.

### Observability

Structured pino logs (with request `traceId`) for: document received / duplicate, each stage `started` / `completed` with `durationMs`, `Ingestion completed|failed` (with `stage` and `code`), embedding retries, and `Retrieval completed` (candidates, returned, below threshold, best score, latency). Stage timings are also stored in `progress.timings_ms`.

## Configuration

Required keys are those in `.env.example` (validated at startup). RAG tuning is optional; defaults live in `src/config.ts`:

| Variable | Default | Notes |
| --- | --- | --- |
| `RAG_VECTOR_DATABASE_URL` | built from `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` | Postgres with pgvector |
| `GEMINI_API_KEY` | — | required for `gemini` |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/models` | |
| `GEMINI_EMBEDDING_PROVIDER` | `gemini-embedding-001` | embedding model |
| `RAG_EMBEDDING_PROVIDER` | `gemini` | `gemini` \| `hashing` (tests only) |
| `RAG_EMBEDDING_DIMENSIONS` | `768` | must match the table |
| `RAG_EMBEDDING_BATCH_SIZE` / `_MAX_RETRIES` / `_RETRY_BASE_DELAY_MS` / `_TIMEOUT_MS` | `50` / `5` / `1000` / `60000` | |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` / `RAG_CHUNK_MIN_CHARS` | `1200` / `200` / `40` | characters |
| `RAG_TABLE_MAX_ROWS_PER_CHUNK` | `20` | |
| `RAG_SEARCH_DEFAULT_TOP_K` / `RAG_SEARCH_MAX_TOP_K` | `5` / `50` | |
| `RAG_SEARCH_MIN_SCORE` | `0.6` | cosine similarity; **calibrate** with real queries |
| `RAG_SEARCH_CANDIDATE_MULTIPLIER` / `RAG_HNSW_EF_SEARCH` | `4` / `100` | |
| `RAG_DEFAULT_NAMESPACE` | `default` | |
| `RAG_MAX_FILE_BYTES` / `RAG_MAX_CHUNKS_PER_DOCUMENT` | 25 MB / `5000` | cost guards |
| `RAG_PROCESSING_STALE_MS` | 15 min | |

## Module map

```text
src/
  modules/
    1_ingestion-api/   presentation (DocumentsController, legacy IngestionController, Zod schemas, mappers)
                       application (DocumentsService, DocumentIngestionService pipeline, format adapters)
                       domain (errors with codes, type policy, normalisation, table structure)
    2_chunker/         ChunkingService + pure boundary-aware packing (domain/text-units.ts)
    3_langgraph/       placeholder ports (not wired; the linear pipeline does not need a graph yet)
    4_embedding/       EmbeddingService, provider port, gemini + hashing adapters
    5_LLM's/           LLM providers (not used by ingestion/retrieval)
    6_http/            shared HTTP client
    7_storage/         storage ports + pgvector repository
    8_ui/              server-side ingestion console (static page over the public API)
    database/vector/   pool, schema bootstrap, transactions
    query-api/         POST /search, legacy /query/fetch, query policy
    retrieval/         query embedding + candidate retrieval
    scoring/           threshold, dedupe, top-K, ordering
  shared/              config module, types, logging, filters, validation
```

## Testing

```bash
npm test            # unit: parsers, chunking, scoring, embeddings (incl. Gemini retry/error mapping)
npm run test:e2e    # full HTTP pipeline: PDF/XLSX/TXT -> ingest -> /search (in-memory storage, hashing embedder)
RAG_TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/db npm run test:int   # real pgvector repository
npx tsc --noEmit -p tsconfig.json && npm run lint && npm run build
```

`test:int` drops and recreates the RAG tables of the target database: point it at a disposable database.

## Known limitations / next steps

- No OCR for scanned PDFs; no `.xls`, `.csv` or `.docx` yet.
- Background ingestion runs in-process (tracked and awaited on shutdown). For volume, move `DocumentIngestionService.start` behind a queue.
- The API has no authentication (the JWT middleware in `shared/middleware` is not wired). Put the service behind the internal network / gateway or wire an API-key guard before exposing it.
- `RAG_SEARCH_MIN_SCORE` must be calibrated against real Gemini scores for your corpus.
- Hybrid (keyword + vector) search and reranking are natural extensions of `ScoringService`.

## Scheduled Agent Reports

Automated Codex scheduled jobs are governed by `AGENT.md` (Code Journey Consultant → `aadr/consultant`, Safety Watcher → `aadr/watcher`, Good Practice And Consistency Supervisor → `aadr/supervisor`). Each agent must check the latest previous report in its own folder; if it is not `Status: GREEN`, the agent writes only a blocked report for the current date.
