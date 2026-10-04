import { Inject, Injectable } from '@nestjs/common';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import type { RagConfig } from '~/config';
import { LoggerService } from '~/shared/logging/main.logger';
import type { EmbeddingDescriptor } from '~/shared/types/semantic-pipeline.type';
import type { EmbeddingVector } from '../domain/types/embedding-vector.type';
import {
  EMBEDDING_PROVIDER,
  EmbeddingTask,
  type EmbeddingProviderPort,
} from '../domain/ports/embedding-provider.port';
import {
  EmptyEmbeddingInputError,
  InvalidEmbeddingResponseError,
} from '../domain/errors/embedding_errors';

export type EmbeddingProgressListener = (
  embedded: number,
  total: number,
) => void | Promise<void>;

/**
 * Provider-neutral embedding use case: batching, input guards and vector
 * validation. Callers never see which provider or SDK produced a vector.
 */
@Injectable()
export class EmbeddingService {
  readonly descriptor: EmbeddingDescriptor;
  private readonly logger = new LoggerService(EmbeddingService.name);
  private readonly batchSize: number;

  constructor(
    @Inject(EMBEDDING_PROVIDER)
    private readonly provider: EmbeddingProviderPort,
    @Inject(RAG_CONFIG) config: RagConfig,
  ) {
    const { provider: name, model, dimensions } = provider.descriptor;
    this.descriptor = {
      provider: name,
      model,
      dimensions,
      version: `${name}:${model}:${dimensions}`,
    };
    this.batchSize = Math.max(
      1,
      Math.min(config.embedding.batchSize, provider.maxBatchSize),
    );
  }

  async embedDocuments(
    texts: string[],
    onProgress?: EmbeddingProgressListener,
  ): Promise<EmbeddingVector[]> {
    this.assertNonEmpty(texts);
    const vectors: EmbeddingVector[] = [];

    for (let start = 0; start < texts.length; start += this.batchSize) {
      const batch = texts.slice(start, start + this.batchSize);
      const startedAt = Date.now();
      const embedded = await this.provider.embed(batch, EmbeddingTask.Document);
      this.validate(embedded, batch.length);
      vectors.push(...embedded);

      this.logger.debug(
        `Embedded batch ${start / this.batchSize + 1} (${batch.length} inputs) in ${Date.now() - startedAt} ms`,
      );
      await onProgress?.(vectors.length, texts.length);
    }

    return vectors;
  }

  async embedQuery(text: string): Promise<EmbeddingVector> {
    this.assertNonEmpty([text]);
    const [vector] = await this.provider.embed(
      [text.trim()],
      EmbeddingTask.Query,
    );
    this.validate([vector], 1);
    return vector;
  }

  private assertNonEmpty(texts: string[]) {
    const emptyIndex = texts.findIndex((text) => !text?.trim());
    if (emptyIndex >= 0)
      throw new EmptyEmbeddingInputError(
        `Refusing to embed empty content at input ${emptyIndex}`,
      );
  }

  private validate(vectors: EmbeddingVector[], expected: number) {
    if (vectors.length !== expected)
      throw new InvalidEmbeddingResponseError(
        `Expected ${expected} vectors, received ${vectors.length}`,
      );

    for (const vector of vectors) {
      if (vector?.length !== this.descriptor.dimensions)
        throw new InvalidEmbeddingResponseError(
          `Embedding dimension mismatch: expected ${this.descriptor.dimensions}, received ${vector?.length ?? 0}`,
        );
      if (!vector.every(Number.isFinite))
        throw new InvalidEmbeddingResponseError(
          'Embedding contains non-finite values',
        );
    }
  }
}
