# GenRag MVP
![Proyect preview](assets/cover1.jpg)
![Proyect preview](assets/cover2.png)

NestJS service that turns documents into retrievable, citable evidence for **external** LLM applications and agents.

```text
Server-side UI (/ui) ─┐
External client ──────┴─> API key ─> Ingestion API ─> QUEUE (Postgres) ─> worker: VALIDATION ─> PARSING ─> CHUNKING ─> EMBEDDING (Gemini) ─> STORAGE (pgvector + full-text)

External LLM / agent ─> API key ─> POST /search ─> [vector ∥ full-text] ─> evidence rules + fusion ─> evidence + citations + provenance + verdict + coverage
```

The service never generates the final answer. It returns evidence (content, citation, source and version, retrieval signals) and a **verdict**: `sufficient`, `partial`, `weak` or `none`, plus the **coverage** of what could and could not be searched. Consumers can therefore tell "there is no evidence" from "I did not find a result".

New here? Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (beginner-friendly, Spanish) and [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

## Quick start

```bash
cp .env.example .env                       # fill DB_*, GEMINI_API_KEY, ...
npm run apikey -- --name operator --namespaces '*' --scopes search,read,write,delete
# add the printed entry to RAG_API_KEYS in .env (only the key's SHA-256 is stored)
docker compose up -d                       # Postgres + pgvector + API
curl http://localhost:${APP_PORT}/health   # {"status":"ok","database":"up",...}
open http://localhost:${APP_PORT}/ui                 # ingestion console (type the API key in the header)
open http://localhost:${APP_PORT}/client-api/swagger # API reference
```

Without Docker: `npm install --legacy-peer-deps && npm run build && node dist/main.js` (or `npm run dev`). Needs a Postgres with the `vector` extension. The API refuses to start without API keys unless `RAG_AUTH_DISABLED=true` (local development only).

## Security model

- **API keys** (`x-api-key: <key>` or `Authorization: Bearer <key>`) on every `/api/v1/*` route; `/health` and `/ui` are public. Keys are configured in `RAG_API_KEYS` (JSON) or `RAG_API_KEYS_FILE` as `{name, key_sha256, namespaces, scopes}`. Plain keys are never stored.
- **The key decides the namespace.** A namespace outside the key returns `403`; another tenant's document id returns `404` (existence is not revealed). With one namespace, the key's namespace is the default. Keys with `"namespaces": "*"` are operator keys.
- **Scopes:** `search` (`POST /search`, legacy `/query/fetch`), `read` (list/get/chunks), `write` (upload/ingest), `delete`. An LLM agent usually needs `search` only.
- **Logs never contain request headers** (no `Authorization`, cookies or keys). Pino also censors sensitive field names wherever they appear. The Gemini key travels in a header, not in the URL.
- **Retrieved content is untrusted data** (`content_is_untrusted: true`). Consumers must not follow instructions found inside chunks.
- **Hidden Excel sheets are not ingested** by default (`RAG_XLSX_INCLUDE_HIDDEN_SHEETS=true` to opt in).

## HTTP API (prefix `/api/v1`)

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `POST` | `/documents` | write | Upload (multipart `file` + optional `namespace`, `source`, `document_type`, `metadata` JSON, `tags`, `ingest=true`). Deduplicated by SHA-256 per namespace: re-uploading returns `200` + `duplicate: true` and the existing id. |
| `POST` | `/documents/{id}/ingest` | write | Queue the pipeline: `202` (poll `GET /documents/{id}`). `{"wait": true}` waits up to `RAG_INGESTION_WAIT_TIMEOUT_MS`. Skipped (`started: false, reason: "already_ingested"`) when chunking/embedding versions are unchanged, unless `{"force": true}`. `409` if already queued/processing, `429` (retryable) when the queue is full. Optional `chunking: {strategy, chunk_size, chunk_overlap, table_max_rows_per_chunk}`. |
| `GET` | `/documents/{id}` | read | Status, stage, attempts, progress (`chunks_embedded/chunks_total`), error with stage and code, system metadata, `requires_reindex`. |
| `GET` | `/documents?namespace=&status=&limit=&offset=` | read | List (restricted to the key's namespaces). |
| `GET` | `/documents/{id}/chunks` | read | Stored chunks, for traceability. |
| `DELETE` | `/documents/{id}` | delete | Deletes the document and its chunks (`409` while a live run owns it). |
| `POST` | `/search` | search | Retrieval API for external servers and agents. |
| `GET` | `/health` (no prefix, public) | — | `200` when the app and PostgreSQL answer, `503` otherwise; includes worker status. |

Legacy endpoints (`POST /ingestion/text|pdf|structured`, `POST /query/fetch`) still work, require the same scopes, and delegate to the same use cases.

Domain errors carry `{statusCode, code, message, retryable}` (authentication errors use the standard `{statusCode, message, error}` shape). `retryable: true` (429, 503) means "try again later", never "no evidence".

### Search contract

```json
POST /api/v1/search
{
  "query": "¿Cuál fue la facturación USD de 2025 en la región Norte?",
  "top_k": 5,
  "min_score": 0.6,
  "namespace": "finanzas",
  "mode": "hybrid",
  "order_by": "score",
  "filters": {
    "document_ids": [], "document_types": ["xlsx"], "sources": [],
    "tags": ["finanzas"], "sheets": ["Facturación"], "metadata": { "year": 2025 }
  }
}
```

```json
{
  "query": "¿Cuál fue la facturación USD de 2025 en la región Norte?",
  "namespace": "finanzas",
  "found": true,
  "verdict": { "status": "sufficient", "reasons": [] },
  "message": null,
  "coverage": {
    "documents_total": 12, "searchable": 11,
    "not_searchable": { "pending": 0, "in_progress": 1, "failed": 0, "requires_reindex": 0 }
  },
  "content_is_untrusted": true,
  "results": [
    {
      "rank": 1,
      "chunk_id": "…", "document_id": "…",
      "content": "Row 4: Año: 2024 | Región: Norte | …\nRow 5: Año: 2025 | Región: Norte | Facturación USD: 1250000 | …",
      "score": 0.8123,
      "citation": "ventas.xlsx, sheet \"Facturación\", rows 5, 6, section \"Reporte de facturación anual\"",
      "signals": {
        "vector_score": 0.8123, "lexical_match": "exact",
        "matched_terms": ["facturacion", "usd", "2025", "region", "norte"],
        "identifiers_matched": ["2025"], "qualified_by": ["vector", "all_terms"], "strength": "strong"
      },
      "source": {
        "document_id": "…", "document_name": "ventas.xlsx", "source": "finanzas/ventas.xlsx",
        "document_hash": "<sha256 of the file>", "ingested_at": "…", "chunk_hash": "…",
        "chunking_version": "chunker-v2", "embedding_version": "gemini:gemini-embedding-001:768",
        "locator": { "page_start": null, "page_end": null, "sheet": "Facturación", "section": "…",
                     "rows": { "start": 4, "end": 6, "matched": [5, 6] } },
        "also_found_in": []
      },
      "metadata": { "document_type": "xlsx", "tags": ["finanzas"], "chunk_type": "table_rows", "chunk": { "row_start": 4, "row_end": 6, "table_row_count": 3 }, "document": { "year": 2025 } }
    }
  ],
  "retrieval": {
    "mode": "hybrid", "top_k": 5, "min_score": 0.6, "lexical_terms": ["facturacion", "usd", "2025", "region", "norte"],
    "identifiers": ["2025"], "candidates": 22, "lexical_candidates": 9, "below_threshold": 17,
    "duplicates_removed": 0, "embedding_version": "gemini:gemini-embedding-001:768", "took_ms": 212
  }
}
```

**Verdict** (deterministic rules in [`scoring/domain/evidence.ts`](src/modules/scoring/domain/evidence.ts)):

| Status | Meaning | Typical reasons |
| --- | --- | --- |
| `sufficient` | At least one strong result: semantically close and not contradicted by a missing identifier, or containing every identifier / every meaningful word of the query. | — |
| `partial` | Real evidence, but it covers only part of the request. | `identifiers_partially_found`, `table_partially_covered` (aggregate question answered from some rows of a table) |
| `weak` | Something similar, but not what was asked. | `identifiers_not_found` (e.g. another invoice), `low_similarity` |
| `none` | Nothing qualifies. | `below_threshold`, `no_candidates`, `no_searchable_documents`, `incomplete_coverage` (documents still processing, failed or needing reindex: retry before concluding absence) |

- Results that do not qualify are dropped; the list is **never padded** to `top_k`. `found` is kept for v1 clients (`true` when any result is returned). New clients should read `verdict`.
- `score` stays the vector cosine similarity. In hybrid mode, results are ordered with chunks containing every identifier first, then by Reciprocal Rank Fusion of the vector and full-text ranks.
- `mode: "vector"` restores the previous retrieval (similarity only); it is the evaluation baseline.
- `order_by: "document"` returns the same results grouped by document in reading order (`rank` keeps relevance).
- Duplicated text found in several documents is returned once, with the other documents in `also_found_in`.

## Pipeline design

### Parsing (one adapter per format, `1_ingestion-api/application/formats`)

| Format | Parser | What is preserved |
| --- | --- | --- |
| PDF | `pdf-parse` (pdf.js) | Page per block, paragraphs rebuilt from visual lines, de-hyphenation, heading detection (numbered / ALL CAPS), repeated headers/footers and page numbers removed, document title/author. Page count is checked before text extraction (`RAG_PDF_MAX_PAGES`). Image-only PDFs fail with `PDF_NO_TEXT` (no OCR). |
| XLSX | `exceljs` | Workbook → sheets → tables split by blank rows; header row detection (generated `Column A…` otherwise), title rows as table caption, formulas as their result, dates as ISO, **percent and currency formats kept** (`15.3%`, `$1250000`), empty columns dropped, **hidden sheets skipped** by default. The uncompressed size is checked from the zip directory before loading (`RAG_XLSX_MAX_UNCOMPRESSED_BYTES`), and non-empty cells are capped (`RAG_XLSX_MAX_CELLS`). |
| TXT/MD | built-in | Encoding (UTF-8 BOM, UTF-16, strict UTF-8, fallback Windows-1252), markdown and heuristic headings, paragraphs. |
| JSON | built-in | Arrays of objects → tables; nested objects → `field.path: value` lines (legacy `/ingestion/structured`). |

### Chunking (`2_chunker`, version `chunker-v2`)

- **Prose (`recursive`)**: section-aware (a chunk never mixes two sections); units split on paragraph → line → sentence → word boundaries, greedily packed up to `chunk_size`, with sentence-aligned `chunk_overlap`. A tiny trailing chunk is merged into the previous one. Every chunk carries `page_start/page_end`, `section` and `heading_path`.
- **Tables (`table`)**: one `table_summary` chunk per table (sheet, caption, columns, row range) plus `table_rows` chunks of up to `table_max_rows_per_chunk` rows, each row rendered as `Row N: Header: value | …` so every chunk is self-describing. Row chunks carry `row_start/row_end` and the table's total `table_row_count`, so retrieval can tell when an answer rests on a slice of a table.
- `auto` (default) picks per block. Empty/punctuation-only chunks and exact duplicates are dropped.
- The text sent to the embedding model is `Document / Sheet / Section` context + content; the **stored** content stays clean for quoting. The same context is indexed for full-text search.
- `chunker-v1` documents are re-processed by a normal (non-forced) ingest request.

### Retrieval (`retrieval` + `scoring` + `query-api`)

- **Vector candidates**: HNSW cosine search filtered by namespace, embedding version and filters; `hnsw.ef_search` and, on pgvector ≥ 0.8, `hnsw.iterative_scan` so filters do not starve top-K.
- **Full-text candidates** (hybrid mode): `search_tsv` (GIN index, `simple` config) matched with an OR of the query terms, same filters, same transaction. Text is normalised in the application ([`shared/text/lexical.ts`](src/shared/text/lexical.ts)): accents folded, and identifiers indexed in split and compact form, so `FV-2025-00123`, `fv 2025 00123` and `FV202500123` (or `900.123.456` and `900123456`) match. No Postgres extension is needed.
- **Evidence rules** per candidate: vector score, matched terms, identifiers (any query token with a digit) found verbatim, matched table rows. A chunk qualifies by similarity (`≥ min_score`), by containing every identifier, or by containing every meaningful query word.
- **Coverage**: one count query over the namespace (with the document-level filters) reports searchable vs pending / in progress / failed / requires-reindex documents.
- `statement_timeout` bounds search SQL; query embeddings use a shorter timeout and fewer retries than ingestion (`RAG_QUERY_EMBEDDING_*`). Provider failures on search return `503` with `retryable: true`.

### Metadata model

| Layer | Where | Examples |
| --- | --- | --- |
| Document metadata | `rag_source_documents.metadata`, `tags` | caller-provided facts (`year`, `area`…), filterable with `filters.metadata` / `filters.tags` |
| Chunk metadata | `rag_document_chunks` columns + `metadata` | `page_start/end`, `section`, `sheet`, `chunk_index`, `chunk_type`, `row_start/end`, `table_row_count`, `columns`, `heading_path` |
| System metadata | `rag_source_documents` | `content_hash`, `status`, `stage`, `attempts`, `error{stage,code,message}`, `progress`, `parser_info` (pages, encoding, sheets, warnings), `chunking{version,…}`, `embedding{provider,model,dimensions,version}` |

Document fields are joined at query time instead of being copied into every chunk.

### Embeddings (`4_embedding`)

`EmbeddingService` (batching, empty-input guard, dimension and finiteness checks) depends on `EmbeddingProviderPort`. Adapters:

- `gemini` (default): REST `batchEmbedContents` through the shared `HttpClientService`; `RETRIEVAL_DOCUMENT` vs `RETRIEVAL_QUERY` task types, `outputDimensionality`, up to 100 inputs per request, exponential backoff with jitter on 408/429/5xx/network errors honouring `Retry-After`; 4xx errors fail fast without leaking the key. Queries use their own short timeout/retry policy.
- `hashing`: deterministic lexical stand-in used by tests, the offline evaluation and smoke runs. **Not semantic: never use it in real environments.**

The embedding **version** (`provider:model:dimensions`) is stored per chunk. Search only compares vectors of the current version; documents embedded with another version report `requires_reindex: true` and are counted in `coverage.not_searchable.requires_reindex`. Changing provider/model means: change config → re-ingest.

### Storage (`7_storage` + `database/vector`)

Postgres + pgvector (existing stack). The schema is bootstrapped **and upgraded** on startup from [`database/vector/schema.ts`](src/modules/database/vector/schema.ts) (idempotent `CREATE/ALTER … IF NOT EXISTS`):

- `rag_source_documents` (unique `namespace + content_hash`, original bytes kept so ingestion can be re-run, queue columns `attempts`, `run_id`, `lease_until`, `available_at`, `ingest_options`).
- `rag_document_chunks` (FK with cascade delete, unique `document_id + chunk_index`, `vector(RAG_EMBEDDING_DIMENSIONS)` with HNSW cosine index, `search_tsv tsvector` with GIN index). Chunks ingested before `search_tsv` existed match lexically after re-ingestion.
- Chunk replacement and the `COMPLETED` transition happen in **one transaction**, guarded by the run's fencing token: a failed run never leaves partial, searchable data; a failed re-ingestion keeps the previous version.
- Startup fails if the table dimension differs from `RAG_EMBEDDING_DIMENSIONS`.

### Ingestion queue, recovery and backpressure

`PENDING → QUEUED → PROCESSING → COMPLETED | FAILED`. The documents table is the queue; no broker is involved.

- **Bounded concurrency:** the in-process `IngestionWorker` runs at most `RAG_INGESTION_CONCURRENCY` documents (CPU, memory, DB connections and provider quota stay bounded). `RAG_INGESTION_WORKER=false` makes an API-only replica.
- **No duplicates:** claims use `SELECT … FOR UPDATE SKIP LOCKED`; each claim gets a `run_id`, and every write (progress, failure, commit) is conditioned on it (fencing).
- **Crash recovery:** the running pipeline renews `lease_until`. If the process dies, the lease expires (`RAG_INGESTION_LEASE_MS`) and any worker reclaims the document. After `RAG_INGESTION_MAX_ATTEMPTS` claims it is marked `FAILED` with `INGESTION_ABANDONED`, so a file that crashes the process cannot loop forever.
- **Retries:** transient failures (provider 408/429/5xx/network, lost DB connection) go back to `QUEUED` with exponential delay; document errors (parsing, limits) fail immediately.
- **Backpressure:** beyond `RAG_INGESTION_MAX_QUEUED` queued documents, ingest requests get `429` (retryable).

### Observability

- Structured pino logs (request `traceId`, API key **name**) for: document received / duplicate, each stage `started` / `completed` with `durationMs`, `Ingestion completed|failed|reclaimed|abandoned` (with `stage`, `code`, `runId`, `attempt`), embedding retries, and `Retrieval completed` (mode, candidates, lexical candidates, returned, verdict, reasons, latency). JSON in every environment except `APP_ENV=dev` (pretty).
- Stage timings are stored in `progress.timings_ms`.
- `GET /health` reports PostgreSQL reachability and worker status.

## Configuration

Required keys are those in `.env.example` (validated at startup). API keys are required unless `RAG_AUTH_DISABLED=true`. RAG tuning is optional; defaults live in `src/config.ts`:

| Variable | Default | Notes |
| --- | --- | --- |
| `RAG_API_KEYS` / `RAG_API_KEYS_FILE` | — | JSON array of `{name, key_sha256, namespaces, scopes}`; generate with `npm run apikey` |
| `RAG_AUTH_DISABLED` | `false` | `true` = no authentication (local development only) |
| `RAG_VECTOR_DATABASE_URL` | built from `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` | Postgres with pgvector |
| `GEMINI_API_KEY` | — | required for `gemini` |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/models` | |
| `GEMINI_EMBEDDING_PROVIDER` | `gemini-embedding-001` | embedding model |
| `RAG_EMBEDDING_PROVIDER` | `gemini` | `gemini` \| `hashing` (tests only) |
| `RAG_EMBEDDING_DIMENSIONS` | `768` | must match the table |
| `RAG_EMBEDDING_BATCH_SIZE` / `_MAX_RETRIES` / `_RETRY_BASE_DELAY_MS` / `_TIMEOUT_MS` | `50` / `5` / `1000` / `60000` | ingestion embeddings |
| `RAG_QUERY_EMBEDDING_TIMEOUT_MS` / `RAG_QUERY_EMBEDDING_MAX_RETRIES` | `5000` / `2` | search embeddings (fail fast) |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` / `RAG_CHUNK_MIN_CHARS` | `1200` / `200` / `40` | characters |
| `RAG_TABLE_MAX_ROWS_PER_CHUNK` | `20` | |
| `RAG_SEARCH_MODE` | `hybrid` | `hybrid` \| `vector` |
| `RAG_SEARCH_DEFAULT_TOP_K` / `RAG_SEARCH_MAX_TOP_K` | `5` / `50` | |
| `RAG_SEARCH_MIN_SCORE` | `0.6` | cosine similarity; **calibrate** with `npm run eval` on your corpus |
| `RAG_SEARCH_CANDIDATE_MULTIPLIER` / `RAG_HNSW_EF_SEARCH` | `4` / `100` | |
| `RAG_SEARCH_STATEMENT_TIMEOUT_MS` | `5000` | per search transaction |
| `RAG_DEFAULT_NAMESPACE` | `default` | |
| `RAG_INGESTION_WORKER` | `true` | `false` = API-only process |
| `RAG_INGESTION_CONCURRENCY` | `2` | documents processed at once per process |
| `RAG_INGESTION_LEASE_MS` | `120000` | dead runs are reclaimed after this |
| `RAG_INGESTION_MAX_ATTEMPTS` | `3` | claims per ingestion request, crashes included |
| `RAG_INGESTION_RETRY_BASE_DELAY_MS` | `5000` | transient-failure backoff base |
| `RAG_INGESTION_POLL_MS` | `1000` | idle worker poll interval |
| `RAG_INGESTION_MAX_QUEUED` | `100` | backpressure threshold (429) |
| `RAG_INGESTION_WAIT_TIMEOUT_MS` | `120000` | max wait for `wait: true` |
| `RAG_MAX_FILE_BYTES` / `RAG_MAX_CHUNKS_PER_DOCUMENT` | 25 MB / `5000` | cost guards |
| `RAG_XLSX_MAX_UNCOMPRESSED_BYTES` / `RAG_XLSX_MAX_CELLS` | 150 MB / `1000000` | workbook guards |
| `RAG_XLSX_INCLUDE_HIDDEN_SHEETS` | `false` | |
| `RAG_PDF_MAX_PAGES` | `1000` | |

`RAG_PROCESSING_STALE_MS` was replaced by `RAG_INGESTION_LEASE_MS`.

## Module map

```text
src/
  modules/
    1_ingestion-api/   presentation (DocumentsController, legacy IngestionController, Zod schemas, mappers)
                       application (DocumentsService, DocumentIngestionService = enqueue,
                                    IngestionWorker = bounded claim loop, IngestionPipeline = one run, format adapters)
                       domain (errors with codes, type policy, normalisation, table structure, zip inspection)
    2_chunker/         ChunkingService + pure boundary-aware packing (domain/text-units.ts)
    3_langgraph/       placeholder ports (not wired; the linear pipeline does not need a graph yet)
    4_embedding/       EmbeddingService, provider port, gemini + hashing adapters
    5_LLM's/           LLM providers (not used by ingestion/retrieval)
    6_http/            shared HTTP client
    7_storage/         storage ports + pgvector repository (queue, chunks, candidates, coverage)
    8_ui/              server-side ingestion console (static page over the public API)
    database/vector/   pool, schema bootstrap/upgrade, transactions
    health/            GET /health
    query-api/         POST /search, legacy /query/fetch, query policy, response contract
    retrieval/         query embedding + candidate retrieval + coverage
    scoring/           evidence rules, fusion, verdict (domain/evidence.ts), top-K, ordering
  shared/
    auth/              API keys: config loading, global guard, namespace resolution
    text/              lexical normalisation shared by indexing and querying
    ...                config module, types, logging, filters, validation
eval/                  deterministic corpus, query set and evaluation runner
```

## Testing

```bash
npm test            # unit: parsers + guards, chunking, lexical normalisation, evidence rules, scoring, embeddings, API keys, log redaction
npm run test:e2e    # full HTTP app on PGlite: auth + cross-namespace isolation, ingestion, search contract,
                    # worker concurrency limit, backpressure, retries, and a SIGKILL crash-recovery test
npm run test:int    # repository SQL on PGlite (queue, fencing, abandonment, hybrid candidates, coverage, schema upgrade)
RAG_TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/db npm run test:int   # same suite on a real Postgres
npm run eval        # retrieval evaluation, vector vs hybrid (see docs/EVALUATION.md)
npx tsc --noEmit -p tsconfig.json && npm run lint && npm run build
```

Tests use [PGlite](https://pglite.dev) (PostgreSQL + pgvector compiled to WebAssembly, dev dependency only), so they run the production SQL without Docker. PGlite is single-connection: lock contention between real connections is only exercised with `RAG_TEST_DATABASE_URL`. `test:int` against a real database drops and recreates the RAG tables: point it at a disposable database.

## Evaluation

Offline run on the bundled corpus (40 queries, `hashing` embedder, `min_score` 0.2):

| | vector (previous retrieval) | hybrid |
| --- | ---: | ---: |
| Hit@5 | 69.7% | 90.9% |
| MRR | 0.633 | 0.909 |
| Trust accuracy (right evidence + right verdict, correct abstentions, no leaks) | 75.0% | 92.5% |

Gains concentrate on codes, amounts and names; semantic queries are unchanged. These numbers were **not** produced with Gemini. See [docs/EVALUATION.md](docs/EVALUATION.md) for method, per-category results, threshold sensitivity and limits.

## Known limitations / next steps

- Not yet measured with real Gemini embeddings: run `RAG_EVAL_PROVIDER=gemini npm run eval` and calibrate `RAG_SEARCH_MIN_SCORE` for your corpus.
- No OCR for scanned PDFs; no `.xls`, `.csv` or `.docx` yet. PDF tables are flattened to text.
- Parsing runs on the worker's event loop: a large PDF can still delay `/search` latency in the same process. Run API-only replicas (`RAG_INGESTION_WORKER=false`) plus worker replicas when that matters.
- Zip sizes declared in a workbook can be forged; the uncompressed-size guard is a first line of defence. Process crashes are then contained by the lease + max-attempts mechanism.
- No document versioning by `source`: a new version of a file is a new document, and both stay searchable until the old one is deleted.
- API keys are static configuration (rotation = config change + restart); there is no per-key rate limiting yet.
- Chunks ingested before the `search_tsv` column existed only gain full-text matching after re-ingestion.
- The legacy `rag_documents` table is no longer used (its rows cannot be traced to a document). Drop it once nothing reads it.

## Scheduled Agent Reports

Automated Codex scheduled jobs are governed by `AGENT.md` (Code Journey Consultant → `aadr/consultant`, Safety Watcher → `aadr/watcher`, Good Practice And Consistency Supervisor → `aadr/supervisor`). Each agent must check the latest previous report in its own folder; if it is not `Status: GREEN`, the agent writes only a blocked report for the current date.
