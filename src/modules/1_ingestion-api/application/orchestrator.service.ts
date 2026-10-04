import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { RagConfig } from '~/config';
import { ChunkingService } from '~/modules/2_chunker/application/chunking.service';
import { EmbeddingService } from '~/modules/4_embedding/application/embedding.service';
import { StorageService } from '~/modules/7_storage/application/services/storage.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import {
  IngestionStage,
  IngestionStatus,
  type ChunkingDescriptor,
  type ChunkingOptions,
  type DocumentRecord,
  type DocumentType,
  type IngestionProgress,
} from '~/shared/types/semantic-pipeline.type';
import {
  ChunkingOutcomeError,
  DocumentBusyError,
  DomainErrorCodes,
  IngestionStageError,
  InvalidDocumentError,
} from '../domain/errors/domain_errors';
import { assertContentMatchesType } from '../domain/services/document-type.policy';
import { DocumentsService } from './documents.service';
import {
  INGESTION_ADAPTERS,
  type IngestionFormatPort,
} from './ports/ingestion-format.port';

export interface StartIngestionOptions {
  chunking?: Partial<ChunkingOptions>;
  /** Re-run even if the document is already ingested with the same versions. */
  force?: boolean;
  /** Await the pipeline instead of running it in the background. */
  wait?: boolean;
}

export interface StartIngestionResult {
  document: DocumentRecord;
  started: boolean;
  reason?: 'already_ingested';
}

/**
 * Ingestion pipeline:
 *   VALIDATION -> PARSING (+normalisation) -> CHUNKING -> EMBEDDING -> STORAGE
 *
 * Each stage is logged and timed; a failure is recorded with the stage where
 * it happened. Chunks are persisted and the document marked COMPLETED in one
 * transaction, so a failed run never leaves partial, searchable data.
 */
@Injectable()
export class DocumentIngestionService implements OnApplicationShutdown {
  private readonly logger = new LoggerService(DocumentIngestionService.name);
  private readonly inflight = new Set<Promise<void>>();

  constructor(
    @Inject(INGESTION_ADAPTERS)
    private readonly formatAdapters: IngestionFormatPort[],
    private readonly documents: DocumentsService,
    private readonly chunker: ChunkingService,
    private readonly embedding: EmbeddingService,
    private readonly storage: StorageService,
    @Inject(RAG_CONFIG) private readonly config: RagConfig,
  ) {}

  async start(
    id: string,
    options: StartIngestionOptions = {},
  ): Promise<StartIngestionResult> {
    const document = await this.documents.get(id);
    const chunking = this.chunker.resolveOptions(options.chunking);

    if (!options.force && this.isUpToDate(document, chunking))
      return { document, started: false, reason: 'already_ingested' };

    const staleBefore = new Date(Date.now() - this.config.processingStaleMs);
    const claimed = await this.storage.claimForProcessing(id, staleBefore);
    if (!claimed)
      throw new DocumentBusyError(`Document ${id} is already being processed`);

    const run = this.run(claimed, chunking);
    this.inflight.add(run);
    void run.finally(() => this.inflight.delete(run));

    if (options.wait) {
      await run;
      return { document: await this.documents.get(id), started: true };
    }
    return { document: claimed, started: true };
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
      document.status === IngestionStatus.Completed &&
      document.embedding?.version !== this.embedding.descriptor.version
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.inflight.size === 0) return;
    this.logger.warn(
      `Waiting for ${this.inflight.size} ingestion(s) before shutdown`,
    );
    await Promise.race([
      Promise.allSettled([...this.inflight]),
      new Promise((resolve) => setTimeout(resolve, 30_000)),
    ]);
  }

  // Never throws: every failure is persisted on the document instead.
  private async run(
    document: DocumentRecord,
    chunking: ChunkingDescriptor,
  ): Promise<void> {
    const progress: IngestionProgress = { timingsMs: {} };
    const log = {
      documentId: document.id,
      namespace: document.namespace,
      documentType: document.documentType,
    };
    const startedAt = Date.now();

    const stage = async <T>(
      name: IngestionStage,
      work: () => Promise<T> | T,
    ): Promise<T> => {
      progress.stage = name;
      await this.storage.updateProgress(document.id, name, progress);
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
        throw new IngestionStageError(name, error);
      }
    };

    try {
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
      const vectors = await stage(IngestionStage.Embedding, () =>
        this.embedding.embedDocuments(
          chunks.map((chunk) => this.chunker.buildEmbeddingInput(label, chunk)),
          async (embedded) => {
            progress.chunksEmbedded = embedded;
            await this.storage.updateProgress(
              document.id,
              IngestionStage.Embedding,
              progress,
            );
          },
        ),
      );

      await stage(IngestionStage.Storage, () =>
        this.storage.commitIngestion(
          document.id,
          chunks.map((chunk, index) => ({
            ...chunk,
            embedding: vectors[index],
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

      this.logger.event('Ingestion completed', {
        ...log,
        chunks: chunks.length,
        durationMs: Date.now() - startedAt,
        embeddingVersion: this.embedding.descriptor.version,
        chunkingVersion: chunking.version,
      });
    } catch (error) {
      const failure =
        error instanceof IngestionStageError
          ? error
          : new IngestionStageError(
              progress.stage ?? IngestionStage.Validation,
              error,
            );
      const cause =
        failure.cause instanceof Error
          ? failure.cause.message
          : failure.message;

      this.logger.eventError('Ingestion failed', {
        ...log,
        stage: failure.stage,
        code: failure.code,
        error: cause,
        durationMs: Date.now() - startedAt,
      });
      await this.storage
        .markFailed(
          document.id,
          {
            stage: failure.stage,
            code: failure.code,
            message: cause,
            at: new Date().toISOString(),
          },
          progress,
        )
        .catch((markError: unknown) =>
          this.logger.error(markError, 'Could not persist ingestion failure'),
        );
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
