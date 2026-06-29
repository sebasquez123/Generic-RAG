import { Inject, Injectable } from '@nestjs/common';
import { EmbeddingService } from '../../embedding/application/embedding.service';
import { StorageService } from '../../storage/application/services/storage.service';
import type {
  EmbeddedDocumentChunk,
  IngestionResult,
  sourceType,
} from '~/shared/types/semantic-pipeline.type';
import {
  INGESTION_ADAPTERS,
  type IngestionFormatAdapter,
  type IngestionFormatInput,
} from './ports/ingestion-format-port.port';
import { getBotIdentityFromContext as context } from '~/shared/middleware/context/decorators/injectBotIdentity';
import { type BotEntity } from '~/shared/middleware/context/types/context.types';
import { LoggerService } from '~/shared/logging/main.logger';


@Injectable()
export class DocumentIngestionService {
  private readonly logger = new LoggerService('IngestionController');
  constructor(
    @Inject(INGESTION_ADAPTERS) private readonly formatAdapters: IngestionFormatAdapter[],
    @context() private readonly botIdentity: BotEntity,
    private readonly embedding: EmbeddingService,
    private readonly storage: StorageService,
  ) {}

  private getAdapter(type: sourceType): IngestionFormatAdapter {
    const adapter = this.formatAdapters.find(
      (candidate) => candidate.type === type,
    );

    if (!adapter) throw new Error(`No ingestion adapter registered for type: ${type}`);

    return adapter;
  }

  public async ingest(
    type: sourceType,
    input: IngestionFormatInput,
  ): Promise<IngestionResult> {
    const initialTime = new Date();
    this.logger.log(`Initialiing ingesting process of ${type} document, by ${this.botIdentity.id} - ${this.botIdentity.name} for `);
    const adapter = this.getAdapter(type);
    const chunks = await adapter.format(input);
    const endtime = new Date();
    this.logger.log(`Ingesting process completed in ${endtime.getTime() - initialTime.getTime()} ms`);
    this.logger.log(`Initialiing embedding process of ${chunks.length} chunks for ${type} document`);
    const embeddedChunks = await Promise.all(
      chunks.map<Promise<EmbeddedDocumentChunk>>(async (chunk) => ({
        ...chunk,
        embedding: await this.embedding.embed(chunk.content),
      })),
    );
    this.logger.log(`Embedding process completed in ${new Date().getTime() - endtime.getTime()} ms`);
    this.logger.log(`Initialiing storing process of ${embeddedChunks.length} chunks for ${type} document`);
    const stored = await this.storage.storeDocumentChunks(embeddedChunks);
    this.logger.log(`Storing process completed in ${new Date().getTime() - endtime.getTime()} ms`);
    this.logger.log(`Ingesting process completed for ${type} document with ${embeddedChunks.length} chunks`);
    return {
      source: input.source,
      type,
      chunkCount: embeddedChunks.length,
      embeddedChunks,
      stored,
    };
  }
}
