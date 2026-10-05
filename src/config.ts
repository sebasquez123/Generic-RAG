import { readFileSync } from 'node:fs';
import path from 'node:path';

import { config, parse } from 'dotenv';
import type { Level } from 'pino';
import { loadApiKeys } from './shared/auth/api-key-config';

config({ path: path.join(__dirname, '..', '.env') });

const exampleEnv = parse(
  readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8'),
);

// Keys that may still be listed in older .env.example files but are no longer
// read: ARTIFACT signed the retired bot JWTs (replaced by API keys).
const RETIRED_KEYS = new Set(['ARTIFACT']);

const missedEnvironmentVariables = Object.keys(exampleEnv).filter(
  (exampleKey) => !RETIRED_KEYS.has(exampleKey) && !process.env[exampleKey],
);
if (missedEnvironmentVariables.length > 0)
  throw new Error(`${missedEnvironmentVariables.join(', ')} not configured`);

// Optional RAG tuning variables. They are intentionally not listed as required
// keys: every one has a safe default so a missing value never blocks startup.
function numberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error(`${key} must be a number, received "${raw}"`);
  return value;
}

function stringEnv(key: string, fallback: string): string {
  const raw = process.env[key]?.trim();
  return raw ? raw : fallback;
}

function vectorDatabaseUrl(): string | undefined {
  if (process.env['RAG_VECTOR_DATABASE_URL'])
    return process.env['RAG_VECTOR_DATABASE_URL'];

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  if (!DB_HOST || !DB_USER || !DB_NAME) return undefined;

  const credentials = DB_PASSWORD
    ? `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`
    : encodeURIComponent(DB_USER);
  return `postgresql://${credentials}@${DB_HOST}:${DB_PORT ?? 5432}/${DB_NAME}`;
}

const configuration = {
  app: {
    name: 'GenRag',
    env: process.env['APP_ENV']!,
    port: Number.parseInt(process.env['APP_PORT']!),
    apiUrl: process.env['APP_API_URL']!,
    version: process.env['APP_VERSION']!,
    isDev: process.env['APP_ENV'] === 'dev' ? true : false,
  },
  log: {
    level: process.env['LOG_LEVEL']! as Level,
  },
  llm: {
    gpt: {
      apiKey: process.env['OPENAI_API_KEY']!,
    },
    gemini: {
      apiKey: process.env['GEMINI_API_KEY']!,
      baseUrl: stringEnv(
        'GEMINI_BASE_URL',
        'https://generativelanguage.googleapis.com/v1beta/models',
      ),
      embeddingModel: stringEnv(
        'GEMINI_EMBEDDING_PROVIDER',
        'gemini-embedding-001',
      ),
    },
  },
  agent: {
    artifact: process.env['ARTIFACT']!,
  },
  rag: {
    defaultNamespace: stringEnv('RAG_DEFAULT_NAMESPACE', 'default'),
    maxFileBytes: numberEnv('RAG_MAX_FILE_BYTES', 25 * 1024 * 1024),
    // Cost guard: a runaway workbook should fail loudly, not embed 100k chunks.
    maxChunksPerDocument: numberEnv('RAG_MAX_CHUNKS_PER_DOCUMENT', 5000),
    auth: {
      // Local development only: every caller gets every namespace and scope.
      disabled: process.env['RAG_AUTH_DISABLED'] === 'true',
      keys: loadApiKeys(process.env),
    },
    ingestion: {
      // false = API-only process (run workers in another container).
      workerEnabled: process.env['RAG_INGESTION_WORKER'] !== 'false',
      concurrency: numberEnv('RAG_INGESTION_CONCURRENCY', 2),
      // A run that stops renewing its lease (crash, kill) is reclaimed after this.
      leaseMs: numberEnv('RAG_INGESTION_LEASE_MS', 2 * 60 * 1000),
      // Claims per document, crashes included: a poison file stops after this.
      maxAttempts: numberEnv('RAG_INGESTION_MAX_ATTEMPTS', 3),
      retryBaseDelayMs: numberEnv('RAG_INGESTION_RETRY_BASE_DELAY_MS', 5000),
      pollIntervalMs: numberEnv('RAG_INGESTION_POLL_MS', 1000),
      // Backpressure: uploads/ingest requests get 429 beyond this queue depth.
      maxQueued: numberEnv('RAG_INGESTION_MAX_QUEUED', 100),
      // How long `wait: true` blocks before answering with the current status.
      waitTimeoutMs: numberEnv('RAG_INGESTION_WAIT_TIMEOUT_MS', 120_000),
    },
    limits: {
      // Sum of uncompressed zip entries; exceljs inflates the whole workbook in memory.
      xlsxMaxUncompressedBytes: numberEnv(
        'RAG_XLSX_MAX_UNCOMPRESSED_BYTES',
        150 * 1024 * 1024,
      ),
      xlsxMaxCells: numberEnv('RAG_XLSX_MAX_CELLS', 1_000_000),
      xlsxIncludeHiddenSheets:
        process.env['RAG_XLSX_INCLUDE_HIDDEN_SHEETS'] === 'true',
      pdfMaxPages: numberEnv('RAG_PDF_MAX_PAGES', 1000),
    },
    vector: {
      databaseUrl: vectorDatabaseUrl(),
      hnswEfSearch: numberEnv('RAG_HNSW_EF_SEARCH', 100),
    },
    chunking: {
      chunkSize: numberEnv('RAG_CHUNK_SIZE', 1200),
      chunkOverlap: numberEnv('RAG_CHUNK_OVERLAP', 200),
      minChunkChars: numberEnv('RAG_CHUNK_MIN_CHARS', 40),
      tableMaxRowsPerChunk: numberEnv('RAG_TABLE_MAX_ROWS_PER_CHUNK', 20),
    },
    embedding: {
      // 'gemini' in every real environment; 'hashing' is an offline lexical
      // stand-in for local smoke tests only (it is not semantic).
      provider: stringEnv('RAG_EMBEDDING_PROVIDER', 'gemini'),
      dimensions: numberEnv('RAG_EMBEDDING_DIMENSIONS', 768),
      batchSize: numberEnv('RAG_EMBEDDING_BATCH_SIZE', 50),
      maxRetries: numberEnv('RAG_EMBEDDING_MAX_RETRIES', 5),
      retryBaseDelayMs: numberEnv('RAG_EMBEDDING_RETRY_BASE_DELAY_MS', 1000),
      timeoutMs: numberEnv('RAG_EMBEDDING_TIMEOUT_MS', 60_000),
      // Queries are latency-bound: fail fast instead of inheriting ingestion retries.
      queryTimeoutMs: numberEnv('RAG_QUERY_EMBEDDING_TIMEOUT_MS', 5000),
      queryMaxRetries: numberEnv('RAG_QUERY_EMBEDDING_MAX_RETRIES', 2),
    },
    search: {
      defaultTopK: numberEnv('RAG_SEARCH_DEFAULT_TOP_K', 5),
      maxTopK: numberEnv('RAG_SEARCH_MAX_TOP_K', 50),
      minScore: numberEnv('RAG_SEARCH_MIN_SCORE', 0.6),
      candidateMultiplier: numberEnv('RAG_SEARCH_CANDIDATE_MULTIPLIER', 4),
      // 'hybrid' (vector + Postgres full-text) or 'vector' (previous behaviour).
      defaultMode: stringEnv('RAG_SEARCH_MODE', 'hybrid') as
        | 'hybrid'
        | 'vector',
      statementTimeoutMs: numberEnv('RAG_SEARCH_STATEMENT_TIMEOUT_MS', 5000),
    },
  },
} as const;

export type RagConfig = typeof configuration.rag;

export default configuration;
