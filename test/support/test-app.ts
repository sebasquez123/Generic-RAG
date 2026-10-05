import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import config, { type RagConfig } from '~/config';
import { AppModule } from '~/app.module';
import { configureApp } from '~/app.setup';
import {
  EMBEDDING_PROVIDER,
  type EmbeddingProviderPort,
} from '~/modules/4_embedding/domain/ports/embedding-provider.port';
import { PgVectorConnectionService } from '~/modules/database/vector/pg-vector-connection.service';
import { hashApiKey, type ApiKeyConfig } from '~/shared/auth/principal';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { PgliteDatabase } from './pglite-database';

/** Plain test keys; configuration only ever holds their SHA-256. */
export const TEST_KEYS = {
  admin: 'test-key-admin',
  tenantA: 'test-key-tenant-a',
  tenantB: 'test-key-tenant-b',
  searchOnly: 'test-key-search-only',
} as const;

const KEYS: ApiKeyConfig[] = [
  {
    name: 'admin',
    keySha256: hashApiKey(TEST_KEYS.admin),
    namespaces: '*',
    scopes: ['search', 'read', 'write', 'delete'],
  },
  {
    name: 'tenant-a',
    keySha256: hashApiKey(TEST_KEYS.tenantA),
    namespaces: ['e2e', 'eval'],
    scopes: ['search', 'read', 'write', 'delete'],
  },
  {
    name: 'tenant-b',
    keySha256: hashApiKey(TEST_KEYS.tenantB),
    namespaces: ['otro-tenant'],
    scopes: ['search', 'read', 'write', 'delete'],
  },
  {
    name: 'search-only',
    keySha256: hashApiKey(TEST_KEYS.searchOnly),
    namespaces: ['e2e'],
    scopes: ['search'],
  },
];

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface TestAppOptions {
  rag?: DeepPartial<RagConfig>;
  /** Persist the database on disk (survives closing/killing the app). */
  dataDir?: string;
  embeddingProvider?: EmbeddingProviderPort;
}

export interface TestApp {
  app: NestExpressApplication;
  db: PgliteDatabase;
  ragConfig: RagConfig;
  http: () => ReturnType<typeof request>;
  get<T>(token: unknown): T;
  close(): Promise<void>;
}

/**
 * The real application (controllers, guard, services, parsers, worker,
 * repository SQL) on PGlite, with the offline hashing embedder unless a
 * provider is given.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const ragConfig = {
    ...config.rag,
    ...options.rag,
    auth: { disabled: false, keys: KEYS },
    embedding: {
      ...config.rag.embedding,
      provider: 'hashing',
      ...options.rag?.embedding,
    },
    search: { ...config.rag.search, minScore: 0.2, ...options.rag?.search },
    ingestion: {
      ...config.rag.ingestion,
      pollIntervalMs: 50,
      retryBaseDelayMs: 50,
      ...options.rag?.ingestion,
    },
    limits: { ...config.rag.limits, ...options.rag?.limits },
    chunking: { ...config.rag.chunking, ...options.rag?.chunking },
  } as RagConfig;

  const db = await PgliteDatabase.create(
    ragConfig.embedding.dimensions,
    options.dataDir,
  );
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PgVectorConnectionService)
    .useValue(db)
    .overrideProvider(RAG_CONFIG)
    .useValue(ragConfig);
  if (options.embeddingProvider)
    builder = builder
      .overrideProvider(EMBEDDING_PROVIDER)
      .useValue(options.embeddingProvider);
  const moduleRef = await builder.compile();

  const app = configureApp(
    moduleRef.createNestApplication<NestExpressApplication>(),
  );
  await app.init();
  // One real listener: supertest otherwise opens an ephemeral server per
  // request, which intermittently resets sockets under concurrent polling.
  await app.listen(0, '127.0.0.1');

  return {
    app,
    db,
    ragConfig,
    http: () => request(app.getHttpServer()),
    get: <T>(token: unknown) => moduleRef.get<T>(token as never),
    async close() {
      await app.close();
      await db.close();
    },
  };
}

/** Polls a document until COMPLETED or FAILED. */
export async function waitForTerminal(
  testApp: TestApp,
  id: string,
  key: string = TEST_KEYS.admin,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { body } = await testApp
      .http()
      .get(`/api/v1/documents/${id}`)
      .set('x-api-key', key)
      .expect(200);
    if (body.status === 'COMPLETED' || body.status === 'FAILED') return body;
    if (Date.now() > deadline)
      throw new Error(`document ${id} still ${body.status}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
