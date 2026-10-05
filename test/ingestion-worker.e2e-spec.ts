import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HashingEmbeddingAdapter } from '~/modules/4_embedding/adapters/local/hashing-embedding.adapter';
import { IngestionWorker } from '~/modules/1_ingestion-api/application/ingestion.worker';
import { EmbeddingProviderError } from '~/modules/4_embedding/domain/errors/embedding_errors';
import {
  EmbeddingTask,
  type EmbeddingProviderPort,
} from '~/modules/4_embedding/domain/ports/embedding-provider.port';
import { buildSalesWorkbook } from './support/fixtures';
import { PgliteDatabase } from './support/pglite-database';
import {
  createTestApp,
  TEST_KEYS,
  waitForTerminal,
  type TestApp,
} from './support/test-app';

jest.setTimeout(180_000);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Hashing embedder that records how many ingestion runs embed at once. */
class InstrumentedEmbedder implements EmbeddingProviderPort {
  private readonly inner = new HashingEmbeddingAdapter(768);
  readonly descriptor = this.inner.descriptor;
  readonly maxBatchSize = this.inner.maxBatchSize;
  inFlight = 0;
  maxInFlight = 0;

  async embed(texts: string[], task: EmbeddingTask) {
    if (task === EmbeddingTask.Query) return this.inner.embed(texts);
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await sleep(150);
      return await this.inner.embed(texts);
    } finally {
      this.inFlight -= 1;
    }
  }
}

const upload = (t: TestApp, name: string, text: string, ingest = true) =>
  t
    .http()
    .post('/api/v1/documents')
    .set('x-api-key', TEST_KEYS.tenantA)
    .field('namespace', 'e2e')
    .field('ingest', String(ingest))
    .attach('file', Buffer.from(text, 'utf8'), name);

describe('Ingestion worker (queue on PostgreSQL)', () => {
  it('never runs more than RAG_INGESTION_CONCURRENCY documents at once', async () => {
    const embedder = new InstrumentedEmbedder();
    const t = await createTestApp({
      embeddingProvider: embedder,
      rag: { ingestion: { concurrency: 2 } },
    });
    const worker = t.get<IngestionWorker>(IngestionWorker);
    let maxActive = 0;
    const sampler = setInterval(() => {
      maxActive = Math.max(maxActive, worker.status().active);
    }, 5);

    try {
      const ids: string[] = [];
      for (let index = 0; index < 8; index += 1) {
        const response = await upload(
          t,
          `doc-${index}.txt`,
          `Documento número ${index}. Contenido único para la prueba ${index}.`,
        ).expect(201);
        ids.push(response.body.document.id);
      }
      const finished = await Promise.all(
        ids.map((id) => waitForTerminal(t, id)),
      );

      expect(finished.every((doc) => doc.status === 'COMPLETED')).toBe(true);
      expect(embedder.maxInFlight).toBe(2); // bounded, and the bound is used
      expect(maxActive).toBeLessThanOrEqual(2);
    } finally {
      clearInterval(sampler);
      await t.close();
    }
  });

  it('applies backpressure: 429 (retryable) when the queue is full', async () => {
    const t = await createTestApp({
      rag: { ingestion: { workerEnabled: false, maxQueued: 2 } },
    });
    try {
      await upload(t, 'a.txt', 'Primer documento en cola').expect(201);
      await upload(t, 'b.txt', 'Segundo documento en cola').expect(201);
      const refused = await upload(t, 'c.txt', 'Tercer documento').expect(429);
      expect(refused.body).toMatchObject({
        code: 'INGESTION_QUEUE_FULL',
        retryable: true,
      });
      // The upload itself is kept; only the ingestion request was refused.
      const listed = await t
        .http()
        .get('/api/v1/documents')
        .set('x-api-key', TEST_KEYS.tenantA)
        .query({ namespace: 'e2e', status: 'PENDING' })
        .expect(200);
      expect(listed.body.total).toBe(1);
    } finally {
      await t.close();
    }
  });

  it('retries transient provider failures, then completes', async () => {
    const inner = new HashingEmbeddingAdapter(768);
    let calls = 0;
    const flaky: EmbeddingProviderPort = {
      descriptor: inner.descriptor,
      maxBatchSize: inner.maxBatchSize,
      embed: async (texts) => {
        calls += 1;
        if (calls === 1) throw new EmbeddingProviderError('Gemini 503', 503);
        return inner.embed(texts);
      },
    };

    const t = await createTestApp({ embeddingProvider: flaky });
    try {
      const { body } = await upload(
        t,
        'flaky.txt',
        'Contenido con reintento',
      ).expect(201);
      const doc = await waitForTerminal(t, body.document.id);
      expect(doc).toMatchObject({ status: 'COMPLETED', attempts: 2 });
    } finally {
      await t.close();
    }
  });

  it('fails an oversized workbook as a document and keeps serving', async () => {
    const t = await createTestApp({
      rag: { limits: { xlsxMaxUncompressedBytes: 2000 } },
    });
    try {
      const { body } = await t
        .http()
        .post('/api/v1/documents')
        .set('x-api-key', TEST_KEYS.tenantA)
        .field('namespace', 'e2e')
        .field('ingest', 'true')
        .attach('file', await buildSalesWorkbook(), 'enorme.xlsx')
        .expect(201);
      const doc = await waitForTerminal(t, body.document.id);
      expect(doc).toMatchObject({
        status: 'FAILED',
        attempts: 1, // permanent: not retried
        error: { stage: 'PARSING', code: 'XLSX_TOO_LARGE' },
      });
      await t.http().get('/health').expect(200);
      await upload(t, 'ok.txt', 'Documento sano después del fallo').expect(201);
    } finally {
      await t.close();
    }
  });

  it('recovers a document whose worker process was killed mid-ingestion', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'genrag-crash-'));
    const leaseMs = 1500;
    try {
      // 1. A worker process claims the document and dies (SIGKILL) while embedding.
      const child = spawn(
        process.execPath,
        [
          '-r',
          'ts-node/register/transpile-only',
          '-r',
          'tsconfig-paths/register',
          join(__dirname, 'support', 'crash-worker.ts'),
          dataDir,
          String(leaseMs),
        ],
        { cwd: join(__dirname, '..'), env: process.env, stdio: 'pipe' },
      );
      const documentId = await new Promise<string>((resolve, reject) => {
        let output = '';
        child.stdout.on('data', (data: Buffer) => {
          output += String(data);
          const match = /READY (\S+)/.exec(output);
          if (match) resolve(match[1]);
        });
        let errors = '';
        child.stderr.on('data', (data: Buffer) => (errors += String(data)));
        child.on('exit', (code) =>
          reject(new Error(`crash-worker exited early (${code}): ${errors}`)),
        );
      });
      child.removeAllListeners('exit');
      const exited = new Promise((resolve) => child.on('exit', resolve));
      child.kill('SIGKILL');
      await exited;

      // 2. The document is left PROCESSING with a lease nobody renews.
      const db = await PgliteDatabase.create(768, dataDir);
      const { rows } = await db.query<{
        status: string;
        attempts: number;
        run_id: string;
      }>(
        'select status, attempts, run_id from rag_source_documents where id = $1',
        [documentId],
      );
      await db.close();
      expect(rows[0]).toMatchObject({ status: 'PROCESSING', attempts: 1 });
      const deadRun = rows[0].run_id;

      // 3. A new worker starts on the same database, reclaims it once the
      //    lease expires, and finishes the ingestion.
      const t = await createTestApp({
        dataDir,
        rag: { ingestion: { leaseMs } },
      });
      try {
        const doc = await waitForTerminal(
          t,
          documentId,
          TEST_KEYS.admin,
          30_000,
        );
        expect(doc).toMatchObject({
          status: 'COMPLETED',
          attempts: 2,
          error: null,
        });
        expect(doc.chunk_count).toBeGreaterThan(0);
        const { rows: after } = await t.db.query<{ run_id: string | null }>(
          'select run_id from rag_source_documents where id = $1',
          [documentId],
        );
        expect(after[0].run_id).toBeNull();
        expect(deadRun).toBeTruthy();
      } finally {
        await t.close();
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
