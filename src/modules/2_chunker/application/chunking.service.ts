import { Inject, Injectable } from '@nestjs/common';
import { ChunkingOrchestratorService } from '~/modules/3_langgraph/application/services/chunking_orchestrator.service';

import {
  LLM_PROVIDER,
  type LlmPort,
} from "~/modules/5_LLM's/domain/ports/llm-chunking.port";
import type {
  EmbeddedDocumentChunk,
  FormattedIngestionChunk,
  IngestionResult,
  sourceType,
} from '~/shared/types/semantic-pipeline.type';

@Injectable()
export class ChunkingService {
  constructor(
    @Inject(LLM_PROVIDER) private readonly chunkingProvider: LlmPort,
    private readonly chunkingOrchestratorService: ChunkingOrchestratorService,
  ) { }

  async chunkPDF(input: {
    source: string;
    type: sourceType;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<FormattedIngestionChunk[]> {
    const chunks = await this.chunkingOrchestratorService.chunkPdf({
      text: input.content,
      source: input.source,
    });

    return chunks.map((content, index) => ({
      source: input.source,
      content,
      metadata: {
        type: input.type,
        chunkIndex: index,
        provider: this.chunkingProvider.provider,
        ...input.metadata,
      },
    }));
  }

  async chunkText(input: {
    source: string;
    type: sourceType;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<FormattedIngestionChunk[]> {
    const chunks = await this.chunkingProvider.chunkText({
      text: input.content,
      source: input.source,
    });

    return chunks.map((content, index) => ({
      source: input.source,
      content,
      metadata: {
        type: input.type,
        chunkIndex: index,
        provider: this.chunkingProvider.provider,
        ...input.metadata,
      },
    }));
  }

  async chunkCustom(input: {
    source: string;
    type: sourceType;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<FormattedIngestionChunk[]> {
    const chunks = await this.chunkingProvider.chunkText({
      text: input.content,
      source: input.source,
    });

    return chunks.map((content, index) => ({
      source: input.source,
      content,
      metadata: {
        type: input.type,
        chunkIndex: index,
        provider: this.chunkingProvider.provider,
        ...input.metadata,
      },
    }));
  }
}
