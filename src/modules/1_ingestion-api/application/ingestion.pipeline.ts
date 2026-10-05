import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import { ChunkingService } from '~/modules/2_chunker/application/chunking.service';
import { EmbeddingService } from '~/modules/4_embedding/application/embedding.service';
import { EmbeddingProviderError } from '~/modules/4_embedding/domain/errors/embedding_errors';
import { LeaseLostError } from '~/modules/7_storage/application/ports/document-storage.repository';
import { StorageService } from '~/modules/7_storage/application/services/storage.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import { toIndexText } from '~/shared/text/lexical';
import {
  IngestionStage,
  type DocumentRecord,
  type DocumentType,
  type IngestionProgress,
} from '~/shared/types/semantic-pipeline.type';
import {
  ChunkingOutcomeError,
  DomainErrorCodes,
  IngestionStageError,
  InvalidDocumentError,
} from '../domain/errors/domain_errors';
import { assertContentMatchesType } from '../domain/services/document-type.policy';
import {
  INGESTION_ADAPTERS,
  type IngestionFormatPort,
} from './ports/ingestion-format.port';

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);
// Node network errors and Postgres connection-class SQLSTATEs (08xxx, 57P0x).
const RETRYABLE_CODES =
  /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|08\w{3}|57P0\d)$/;

/**
 * Transient = worth another attempt later (provider throttling or outage,
 * lost DB connection). Parsing, validation and limit errors are properties of
 * the document: retrying them only burns provider quota.
 */
export function isTransientFailure(error: unknown): boolean {
  const cause = error instanceof IngestionStageError ? error.cause : error;
  if (cause instanceof EmbeddingProviderError)
    return cause.status === undefined || RETRYABLE_HTTP.has(cause.status);
  const code = (cause as { code?: unknown })?.code;
  return typeof code === 'string' && RETRYABLE_CODES.test(code);
}

/**
 * Ingestion of one claimed document:
 *   VALIDATION -> PARSING (+normalisation) -> CHUNKING -> EMBEDDING -> STORAGE
 *
 * The run owns the document through `runId` (fencing token) and keeps a lease
 * alive while it works. Every write is conditioned on still owning the
 * document, so a run that was presumed dead can never overwrite the run that
 * replaced it. Chunks are persisted and the document marked COMPLETED in one
 * transaction: a failed run never leaves partial, searchable data.
 */
@Injectable()
export class IngestionPipeline {
  private readonly logger = new LoggerService(IngestionPipeline.name);

  constructor(
    @Inject(INGESTION_ADAPTERS)
    private readonly formatAdapters: IngestionFormatPort[],
    private readonly chunker: ChunkingService,
    private readonly embedding: EmbeddingService,
    private readonly storage: StorageService,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  // Never throws: every outcome is persisted on the document (or skipped when
  // ownership was lost, in which case the new owner decides).
  async process(document: DocumentRecord): Promise<void> {
    const runId = document.runId!;
    const { leaseMs } = this.config.ingestion;
    const progress: IngestionProgress = { timingsMs: {} };
    const log = {
      documentId: document.id,
      namespace: document.namespace,
      documentType: document.documentType,
      runId,
      attempt: document.attempts,
    };
    const startedAt = Date.now();
    let leaseLost = false;

    const renew = async (stage?: IngestionStage) => {
      const owned = await this.storage.renewLease(document.id, runId, leaseMs, {
        stage,
        progress,
      });
      if (!owned) {
        leaseLost = true;
        throw new LeaseLostError(`Run ${runId} lost document ${document.id}`);
      }
    };
    // Renewal also happens between stages and embedding batches; the timer
    // covers long single steps (big batches, slow provider retries).
    const heartbeat = setInterval(
      () => void renew().catch(() => undefined),
      Math.max(1000, Math.floor(leaseMs / 3)),
    );
    heartbeat.unref();

    const stage = async <T>(
      name: IngestionStage,
      work: () => Promise<T> | T,
    ): Promise<T> => {
      progress.stage = name;
      await renew(name);
      this.logger.event(`${name} started`, { ...log, stage: name });
      const stageStart = Date.now();
      try {
        const result = await work();
        const durationMs = Date.now() - stageStart;
        progress.timingsMs![name.toLowerCase() as Lowercase<IngestionStage>] =
          durationMs;
        this.logger.event(`${name} completed`, {
          ...log,
          stage: name,
          durationMs,
        });
        return result;
      } catch (error) {
        if (error instanceof LeaseLostError) throw error;
        throw new IngestionStageError(name, error);
      }
    };

    try {
      const chunking =
        document.requestedChunking ?? this.chunker.resolveOptions();

      const buffer = await stage(IngestionStage.Validation, async () => {
        const file = await this.storage.getDocumentFile(document.id);
        if (!file)
          throw new InvalidDocumentError('Stored file content is missing');
        assertContentMatchesType(file, document.documentType);
        return file;
      });

      const parsed = await stage(IngestionStage.Parsing, () =>
        this.adapterFor(document.documentType).parse({
          buffer,
          fileName: document.name,
          mimeType: document.mimeType,
        }),
      );

      const chunks = await stage(IngestionStage.Chunking, () => {
        const drafts = this.chunker.chunk(parsed, chunking);
        if (drafts.length === 0)
          throw new ChunkingOutcomeError(
            DomainErrorCodes.NO_CHUNKS,
            'Document produced no retrievable chunks',
          );
        if (drafts.length > this.config.maxChunksPerDocument)
          throw new ChunkingOutcomeError(
            DomainErrorCodes.TOO_MANY_CHUNKS,
            `Document produced ${drafts.length} chunks (limit ${this.config.maxChunksPerDocument})`,
          );
        return drafts;
      });
      progress.chunksTotal = chunks.length;
      progress.chunksEmbedded = 0;

      const label =
        parsed.title && parsed.title !== document.name
          ? `${parsed.title} (${document.name})`
          : document.name;
      const inputs = chunks.map((chunk) =>
        this.chunker.buildEmbeddingInput(label, chunk),
      );
      const vectors = await stage(IngestionStage.Embedding, () =>
        this.embedding.embedDocuments(inputs, async (embedded) => {
          progress.chunksEmbedded = embedded;
          await renew(IngestionStage.Embedding);
        }),
      );

      await stage(IngestionStage.Storage, () =>
        this.storage.commitIngestion(
          document.id,
          runId,
          chunks.map((chunk, index) => ({
            ...chunk,
            embedding: vectors[index],
            // Same context the embedding saw (document, sheet, section), so
            // a file or section name is also matchable by full-text search.
            searchText: toIndexText(inputs[index]),
          })),
          {
            parserInfo: {
              ...parsed.info,
              title: parsed.title,
              warnings: parsed.warnings,
            },
            chunking,
            embedding: this.embedding.descriptor,
            progress: { ...progress, stage: undefined },
          },
        ),
      );

      // Best effort: the commit could not include its own duration.
      await this.storage
        .recordCompletedProgress(document.id, { ...progress, stage: undefined })
        .catch(() => undefined);

      this.logger.event('Ingestion completed', {
        ...log,
        chunks: chunks.length,
        durationMs: Date.now() - startedAt,
        embeddingVersion: this.embedding.descriptor.version,
        chunkingVersion: chunking.version,
      });
    } catch (error) {
      await this.handleFailure(error, document, runId, progress, {
        ...log,
        leaseLost,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async handleFailure(
    error: unknown,
    document: DocumentRecord,
    runId: string,
    progress: IngestionProgress,
    log: Record<string, unknown>,
  ) {
    const leaseLost =
      log['leaseLost'] === true ||
      error instanceof LeaseLostError ||
      (error as IngestionStageError)?.cause instanceof LeaseLostError;
    if (leaseLost) {
      this.logger.warn(
        `Ingestion run ${runId} for document ${document.id} lost its lease; leaving the document to its new owner`,
      );
      return;
    }

    const failure =
      error instanceof IngestionStageError
        ? error
        : new IngestionStageError(
            progress.stage ?? IngestionStage.Validation,
            error,
          );
    const cause =
      failure.cause instanceof Error ? failure.cause.message : failure.message;
    const record = {
      stage: failure.stage,
      code: failure.code,
      message: cause,
      at: new Date().toISOString(),
    };
    const { maxAttempts, retryBaseDelayMs } = this.config.ingestion;
    const retry =
      isTransientFailure(failure) && document.attempts < maxAttempts;

    this.logger.eventError(
      retry ? 'Ingestion attempt failed; will retry' : 'Ingestion failed',
      { ...log, stage: failure.stage, code: failure.code, error: cause },
    );
    try {
      if (retry)
        await this.storage.requeue(
          document.id,
          runId,
          record,
          retryBaseDelayMs * 2 ** (document.attempts - 1),
        );
      else await this.storage.markFailed(document.id, runId, record, progress);
    } catch (persistError) {
      // The lease expires and another worker reclaims the document.
      this.logger.error(persistError, 'Could not persist ingestion outcome');
    }
  }

  private adapterFor(type: DocumentType): IngestionFormatPort {
    const adapter = this.formatAdapters.find(
      (candidate) => candidate.type === type,
    );
    if (!adapter)
      throw new InvalidDocumentError(`No parser registered for type: ${type}`);
    return adapter;
  }
}
