import { readFileSync } from 'node:fs';
import path from 'node:path';

import { config, parse } from 'dotenv';
import type { Level } from 'pino';

config({ path: path.join(__dirname, '..', '.env') });

const exampleEnv = parse(
  readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8'),
);

const missedEnvironmentVariables = Object.keys(exampleEnv).filter(
  (exampleKey) => !process.env[exampleKey],
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
    processingStaleMs: numberEnv('RAG_PROCESSING_STALE_MS', 15 * 60 * 1000),
    // Cost guard: a runaway workbook should fail loudly, not embed 100k chunks.
    maxChunksPerDocument: numberEnv('RAG_MAX_CHUNKS_PER_DOCUMENT', 5000),
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
    },
    search: {
      defaultTopK: numberEnv('RAG_SEARCH_DEFAULT_TOP_K', 5),
      maxTopK: numberEnv('RAG_SEARCH_MAX_TOP_K', 50),
      minScore: numberEnv('RAG_SEARCH_MIN_SCORE', 0.6),
      candidateMultiplier: numberEnv('RAG_SEARCH_CANDIDATE_MULTIPLIER', 4),
    },
  },
} as const;

export type RagConfig = typeof configuration.rag;

export default configuration;
