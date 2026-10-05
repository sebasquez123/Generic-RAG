import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import { ChunkingService } from '~/modules/2_chunker/application/chunking.service';
import { EmbeddingService } from '~/modules/4_embedding/application/embedding.service';
import { StorageService } from '~/modules/7_storage/application/services/storage.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import {
  IngestionStatus,
  type ChunkingDescriptor,
  type ChunkingOptions,
  type DocumentRecord,
} from '~/shared/types/semantic-pipeline.type';
import {
  DocumentBusyError,
  IngestionQueueFullError,
} from '../domain/errors/domain_errors';
import { IngestionWorker } from './ingestion.worker';

export interface StartIngestionOptions {
  chunking?: Partial<ChunkingOptions>;
  /** Re-run even if the document is already ingested with the same versions. */
  force?: boolean;
  /** Wait (up to RAG_INGESTION_WAIT_TIMEOUT_MS) for the queued run to finish. */
  wait?: boolean;
}

export interface StartIngestionResult {
  document: DocumentRecord;
  started: boolean;
  reason?: 'already_ingested';
}

const TERMINAL = new Set([IngestionStatus.Completed, IngestionStatus.Failed]);

/**
 * Entry point of ingestion requests. It only decides whether a document needs
 * (re)processing and queues it; the IngestionWorker runs the pipeline with
 * bounded concurrency, crash recovery and retries.
 */
@Injectable()
export class DocumentIngestionService {
  constructor(
    private readonly chunker: ChunkingService,
    private readonly embedding: EmbeddingService,
    private readonly storage: StorageService,
    private readonly worker: IngestionWorker,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  /** `document` must already be authorised for the caller. */
  async start(
    document: DocumentRecord,
    options: StartIngestionOptions = {},
  ): Promise<StartIngestionResult> {
    const chunking = this.chunker.resolveOptions(options.chunking);

    if (!options.force && this.isUpToDate(document, chunking))
      return { document, started: false, reason: 'already_ingested' };
    if (this.isBusy(document)) throw this.busy(document.id);

    // Backpressure: refuse new work instead of letting the queue grow unbounded.
    if ((await this.storage.countQueued()) >= this.config.ingestion.maxQueued)
      throw new IngestionQueueFullError(
        `Ingestion queue is full (${this.config.ingestion.maxQueued} documents); retry later`,
      );

    const queued = await this.storage.enqueue(document.id, chunking);
    if (!queued) throw this.busy(document.id);
    this.worker.notify();

    if (!options.wait) return { document: queued, started: true };
    return { document: await this.waitForOutcome(document.id), started: true };
  }

  /** Queued, or processing under a live lease. */
  isBusy(document: DocumentRecord): boolean {
    if (document.status === IngestionStatus.Queued) return true;
    return (
      document.status === IngestionStatus.Processing &&
      (document.leaseUntil?.getTime() ?? 0) > Date.now()
    );
  }

  /** True when the stored chunks were produced by the current pipeline versions. */
  isUpToDate(document: DocumentRecord, chunking: ChunkingDescriptor): boolean {
    if (document.status !== IngestionStatus.Completed) return false;
    const previous = document.chunking;
    return (
      document.embedding?.version === this.embedding.descriptor.version &&
      previous?.version === chunking.version &&
      previous.strategy === chunking.strategy &&
      previous.chunkSize === chunking.chunkSize &&
      previous.chunkOverlap === chunking.chunkOverlap &&
      previous.minChunkChars === chunking.minChunkChars &&
      previous.tableMaxRowsPerChunk === chunking.tableMaxRowsPerChunk
    );
  }

  /** Document ingested with another embedding space is invisible to search. */
  requiresReindex(document: DocumentRecord): boolean {
    return (
      document.chunkCount > 0 &&
      document.embedding?.version !== this.embedding.descriptor.version
    );
  }

  /**
   * Polls until the run finishes. On timeout the current (still running)
   * state is returned and the caller can keep polling GET /documents/{id}.
   */
  private async waitForOutcome(id: string): Promise<DocumentRecord> {
    const deadline = Date.now() + this.config.ingestion.waitTimeoutMs;
    let delay = 25;
    for (;;) {
      const document = await this.storage.findDocument(id);
      if (!document) throw this.busy(id);
      if (TERMINAL.has(document.status) || Date.now() >= deadline)
        return document;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 500);
    }
  }

  private busy(id: string) {
    return new DocumentBusyError(
      `Document ${id} is already queued or being processed`,
    );
  }
}
