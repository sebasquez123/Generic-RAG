import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { RagConfig } from '~/config';
import { StorageService } from '~/modules/7_storage/application/services/storage.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import { IngestionPipeline } from './ingestion.pipeline';

const SHUTDOWN_GRACE_MS = 30_000;

/**
 * In-process ingestion worker over the documents table:
 * - at most RAG_INGESTION_CONCURRENCY documents run at once (backpressure on
 *   CPU, memory, DB connections and the embedding provider);
 * - claims use SKIP LOCKED, so several replicas never process the same row;
 * - a run that dies stops renewing its lease and is reclaimed by any worker
 *   once the lease expires; after RAG_INGESTION_MAX_ATTEMPTS it is failed.
 *
 * Disable it with RAG_INGESTION_WORKER=false to run API-only replicas.
 */
@Injectable()
export class IngestionWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new LoggerService(IngestionWorker.name);
  private readonly active = new Set<Promise<void>>();
  private running = false;
  private loop?: Promise<void>;
  private wake?: () => void;
  private pendingWake = false;

  constructor(
    private readonly pipeline: IngestionPipeline,
    private readonly storage: StorageService,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.ingestion.workerEnabled) this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.run();
    this.logger.event('Ingestion worker started', {
      concurrency: this.config.ingestion.concurrency,
      leaseMs: this.config.ingestion.leaseMs,
      maxAttempts: this.config.ingestion.maxAttempts,
    });
  }

  /**
   * Stops claiming and waits for running documents. Anything still running
   * after the grace period keeps its lease until it expires and is then
   * reclaimed by another worker (or this one after a restart).
   */
  async stop(graceMs = SHUTDOWN_GRACE_MS): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.notify();
    await this.loop;
    if (this.active.size === 0) return;
    this.logger.warn(
      `Waiting for ${this.active.size} ingestion(s) before shutdown`,
    );
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled([...this.active]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, graceMs);
      }),
    ]);
    clearTimeout(timer);
  }

  /** Wakes the loop now instead of at the next poll (e.g. right after enqueue). */
  notify(): void {
    if (this.wake) this.wake();
    else this.pendingWake = true;
  }

  status() {
    return {
      enabled: this.config.ingestion.workerEnabled,
      running: this.running,
      active: this.active.size,
      concurrency: this.config.ingestion.concurrency,
    };
  }

  private async run(): Promise<void> {
    const { concurrency, leaseMs, maxAttempts, pollIntervalMs } =
      this.config.ingestion;

    while (this.running) {
      try {
        const abandoned = await this.storage.failAbandoned(maxAttempts);
        for (const id of abandoned)
          this.logger.eventError('Ingestion abandoned after max attempts', {
            documentId: id,
            maxAttempts,
          });

        while (this.running && this.active.size < concurrency) {
          const document = await this.storage.claimNext(
            randomUUID(),
            leaseMs,
            maxAttempts,
          );
          if (!document) break;
          if (document.attempts > 1)
            this.logger.event('Ingestion reclaimed', {
              documentId: document.id,
              attempt: document.attempts,
            });
          const run = this.pipeline.process(document).finally(() => {
            this.active.delete(run);
            this.notify(); // a slot is free: claim the next one right away
          });
          this.active.add(run);
        }
      } catch (error) {
        // DB unavailable or similar: keep the loop alive and retry next poll.
        this.logger.error(error, 'Ingestion worker iteration failed');
      }
      await this.sleep(pollIntervalMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    if (this.pendingWake || !this.running) {
      this.pendingWake = false;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        resolve();
      }
      this.wake = () => {
        this.wake = undefined;
        done();
      };
    }).then(() => {
      this.wake = undefined;
    });
  }
}
