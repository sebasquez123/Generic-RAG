import { Injectable, Inject } from '@nestjs/common';

import { HttpClientService } from '~/modules/6_http';
import {
  type LlmPort,
  type LlmChunkingProviderName,
  type LlmConfig,
  LLM_PROVIDER_CONFIG,
  ChunkTextInput,
} from '../../domain/ports/llm-chunking.port';

import { GeminiGatewayError, GeminiNoFoundError } from '../../domain/errors/gemini_errors';

import type { GeminiChunkResponse, GeminiEmbeddingResponse } from '../types/gemini_model_types';

@Injectable()
export class GeminiLlmService implements LlmPort {
  public readonly providerName: LlmChunkingProviderName;

  constructor(
    @Inject(LLM_PROVIDER_CONFIG) private readonly config: LlmConfig,
    private readonly http: HttpClientService
  ) {
    if (!this.config.API_KEY) throw new GeminiNoFoundError('Gemini LLM api key not configured.', GeminiLlmService.name, config);
    if (!this.config.BASE_URL) throw new GeminiNoFoundError('Gemini LLM base url not configured.', GeminiLlmService.name, config);
    if (!this.config.PROVIDER_NAME) throw new GeminiNoFoundError('Gemini LLM provider name not configured.', GeminiLlmService.name, config);
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
    const prompt =
      this.setupChunkPrompt(input.source, this.config.FORMAT_DEMANDED, input.text, this.config.CHUNKING_PROMPT);
    const url = `${this.config.BASE_URL}/${this.config.CHUNKING_PROVIDER}:generateContent`
    const body = await this.http.post<GeminiChunkResponse>(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
      {
        params: { key: this.config.API_KEY },
        headers: { 'content-type': 'application/json' },
      },
    );

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new GeminiGatewayError('Gemini chunking response was empty.', GeminiLlmService.name, `res: ${text}, \n url: ${url}`);

    return JSON.parse(text);
  }

  async embedText(input: string): Promise<number[] | undefined> {
    const body = await this.http.post<GeminiEmbeddingResponse>(
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
