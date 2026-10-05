/**
 * Child process for the crash-recovery test. It boots the real application on
 * an on-disk PGlite database, uploads a document, and blocks forever inside
 * the embedding stage. When the document is PROCESSING it prints
 * `READY <documentId>` so the parent can kill it with SIGKILL (no shutdown
 * hooks, no lease release: exactly what a crashed pod looks like).
 *
 *   node -r ts-node/register/transpile-only -r tsconfig-paths/register \
 *     test/support/crash-worker.ts <dataDir> <leaseMs>
 */
import { HashingEmbeddingAdapter } from '~/modules/4_embedding/adapters/local/hashing-embedding.adapter';
import type { EmbeddingProviderPort } from '~/modules/4_embedding/domain/ports/embedding-provider.port';
import { HANDBOOK_TXT } from './fixtures';
import { createTestApp, TEST_KEYS } from './test-app';

async function main() {
  const [dataDir, leaseMs] = process.argv.slice(2);
  const hashing = new HashingEmbeddingAdapter(768);
  const hanging: EmbeddingProviderPort = {
    descriptor: hashing.descriptor,
    maxBatchSize: hashing.maxBatchSize,
    embed: () => new Promise<number[][]>(() => undefined), // never returns
  };

  const app = await createTestApp({
    dataDir,
    embeddingProvider: hanging,
    rag: { ingestion: { leaseMs: Number(leaseMs) } },
  });
  const upload = await app
    .http()
    .post('/api/v1/documents')
    .set('x-api-key', TEST_KEYS.tenantA)
    .field('namespace', 'e2e')
    .field('ingest', 'true')
    .attach('file', Buffer.from(HANDBOOK_TXT, 'utf8'), 'manual.md');
  const id = upload.body.document.id as string;

  for (;;) {
    const { rows } = await app.db.query<{ status: string; stage: string }>(
      'select status, stage from rag_source_documents where id = $1',
      [id],
    );
    if (rows[0]?.status === 'PROCESSING' && rows[0]?.stage === 'EMBEDDING') {
      process.stdout.write(`READY ${id}\n`);
      return; // keep the process (and its open database) alive until killed
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`crash-worker failed: ${String(error)}\n`);
  process.exit(1);
});
