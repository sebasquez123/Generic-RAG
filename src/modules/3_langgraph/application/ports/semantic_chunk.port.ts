import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';

export const SEMANTIC_CHUNKING_ADAPTER = Symbol('SEMANTIC_CHUNKING_ADAPTER');

export interface ChunkingLangChainPort {
  chunkPdf(question: string): Promise<string[]>;
  chunkText(question: string): Promise<string[]>;
  chunkCustom(question: string): Promise<string[]>;
}
