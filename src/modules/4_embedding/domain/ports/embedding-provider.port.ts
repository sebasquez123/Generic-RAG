import type { EmbeddingDescriptor } from '~/shared/types/semantic-pipeline.type';

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/** Asymmetric retrieval: documents and queries may be embedded differently. */
export enum EmbeddingTask {
  Document = 'document',
  Query = 'query',
}

export interface EmbeddingProviderPort {
  readonly descriptor: Omit<EmbeddingDescriptor, 'version'>;
  /** Hard provider limit of inputs per request. */
  readonly maxBatchSize: number;
  /** Returns one vector per input, in input order. */
  embed(texts: string[], task: EmbeddingTask): Promise<number[][]>;
}
