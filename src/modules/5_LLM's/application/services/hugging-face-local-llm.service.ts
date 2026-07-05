import { Injectable, Inject } from '@nestjs/common';

import {
  type ChunkTextInput,
  type LlmChunkingPort,
  type LlmChunkingProviderName,
  type LlmConfig,
  LLM_PROVIDER_CONFIG,
} from '../../domain/ports/llm-chunking.port';

import { fallbackChunkText } from '../../utils/DummySplitters';

import type { Tokenizer, TransformersModule } from '../types/local_model_types';

@Injectable()
export class HuggingFaceLocalLlmService implements LlmChunkingPort {

  public readonly providerName: LlmChunkingProviderName;
  private tokenizer?: Tokenizer;
  constructor(
    @Inject(LLM_PROVIDER_CONFIG) private readonly config: LlmConfig,
  ) { }

  async chunkText(input: ChunkTextInput): Promise<string[]> {
    const tokenizer = await this.getTokenizer();

    if (!tokenizer) {
      return fallbackChunkText(input.text, input.maxChunkLength);
    }

    try {
      const maxTokens = Number(process.env['HF_LOCAL_CHUNK_MAX_TOKENS'] ?? 220);
      const overlap = Number(
        process.env['HF_LOCAL_CHUNK_OVERLAP_TOKENS'] ?? 30,
      );
      const tokens = await tokenizer.encode(input.text);
      const chunks: string[] = [];

      for (
        let start = 0;
        start < tokens.length;
        start += Math.max(maxTokens - overlap, 1)
      ) {
        const decoded = await tokenizer.decode(
          tokens.slice(start, start + maxTokens),
        );
        const chunk = decoded.trim();

        if (chunk) {
          chunks.push(chunk);
        }
      }

      return chunks.length
        ? chunks
        : fallbackChunkText(input.text, input.maxChunkLength);
    } catch {
      return fallbackChunkText(input.text, input.maxChunkLength);
    }
  }

  private async getTokenizer(): Promise<Tokenizer | undefined> {
    if (this.tokenizer) {
      return this.tokenizer;
    }

    try {
      const { AutoTokenizer } =
        (await import('@huggingface/transformers')) as TransformersModule;

      this.tokenizer = (await AutoTokenizer.from_pretrained(this.model, {
        local_files_only: true,
      })) as Tokenizer;
      return this.tokenizer;
    } catch {
      return undefined;
    }
  }
}
