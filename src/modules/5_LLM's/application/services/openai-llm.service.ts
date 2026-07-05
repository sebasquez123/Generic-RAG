import { Injectable, Inject } from '@nestjs/common';

import { HttpClientService } from '~/modules/6_http';
import {
  type ChunkTextInput,
  type LlmPort,
  type LlmChunkingProviderName,
  type LlmConfig,
  LLM_PROVIDER_CONFIG,
} from '../../domain/ports/llm-chunking.port';

import type { OpenAiChunkResponse, OpenAiEmbeddingResponse } from '../types/openai_model_types';
import { OpenAiGatewayError, OpenAiNoFoundError } from '../../domain/errors/openai_errors';

@Injectable()
export class OpenAiLlmService implements LlmPort {

  public readonly providerName: LlmChunkingProviderName;

  constructor(
    @Inject(LLM_PROVIDER_CONFIG) private readonly config: LlmConfig,
    private readonly http: HttpClientService) {
    if (!this.config.API_KEY) throw new OpenAiNoFoundError('OpenAI LLM api key not configured.', OpenAiLlmService.name, config);
    if (!this.config.BASE_URL) throw new OpenAiNoFoundError('OpenAI LLM base url not configured.', OpenAiLlmService.name, config);
    if (!this.config.PROVIDER_NAME) throw new OpenAiNoFoundError('OpenAI LLM provider name not configured.', OpenAiLlmService.name, config);
  }

  private setupChunkPrompt(source: string, format: string, text: string, prompt?: string) {
    if (!prompt) {
      return `
        Split the following input into concise retrieval chunks.
        Return only JSON in this shape: ${format}.
        Keep semantic meaning intact and remove empty chunks.
        Source: ${source}
        `
    }
    return `
    Instructions: ${prompt}
    Format: ${format}
    Source: ${source}
    Text input: ${text}
    `
  }

  async chunkText(input: ChunkTextInput): Promise<string[] | undefined> {

    const prompt = this.setupChunkPrompt(input.source, this.config.FORMAT_DEMANDED, input.text, this.config.CHUNKING_PROMPT);
    try {
      const body = await this.http.post<OpenAiChunkResponse>(
        this.config.BASE_URL,
        {
          model: this.config.CHUNKING_PROVIDER,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You split documents into concise retrieval chunks and return only JSON.',
            },
            {
              role: 'user',
              content: prompt
            },
          ],
        },
        {
          headers: {
            authorization: `Bearer ${this.config.API_KEY}`,
            'content-type': 'application/json',
          },
        },
      );

      const content = body.choices?.[0]?.message?.content;
      const parsed = content
        ? (JSON.parse(content) as { chunks?: unknown })
        : {};

      if (!Array.isArray(parsed.chunks))
        throw new OpenAiGatewayError('OpenAi chunking response was empty.', OpenAiLlmService.name, `res: ${content}, \n url: ${this.config.BASE_URL}`);

      return parsed.chunks
        .filter((chunk): chunk is string => typeof chunk === 'string')
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0);
    } catch {

    }
  }

  async embedText(input: string): Promise<number[] | undefined> {
    const body = await this.http.post<OpenAiEmbeddingResponse>(
      `${this.config.BASE_URL}/${this.config.EMBEDDING_PROVIDER}:embedContent`,
      {
        model: `models/${this.config.EMBEDDING_PROVIDER}`,
        content: { parts: [{ text: input }] },
      },
      {
        params: { key: this.config.API_KEY },
        headers: { 'content-type': 'application/json' },
      },
    );
    return body.embedding?.values;
  }
}
