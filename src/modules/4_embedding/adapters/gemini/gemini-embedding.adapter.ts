import type { AxiosError } from 'axios';
import type { HttpClientService } from '~/modules/6_http';
import { LoggerService } from '~/shared/logging/main.logger';
import { withRetry } from '~/shared/helpers/retry';
import {
  EmbeddingTask,
  type EmbeddingProviderPort,
} from '../../domain/ports/embedding-provider.port';
import {
  EmbeddingProviderError,
  EmbeddingProviderNotConfiguredError,
  InvalidEmbeddingResponseError,
} from '../../domain/errors/embedding_errors';

export interface GeminiEmbeddingConfig {
  apiKey: string;
  /** e.g. https://generativelanguage.googleapis.com/v1beta/models */
  baseUrl: string;
  model: string;
  dimensions: number;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  /** Queries are latency-bound: shorter timeout, fewer attempts than ingestion. */
  queryTimeoutMs?: number;
  queryMaxRetries?: number;
}

interface GeminiBatchEmbeddingResponse {
  embeddings?: Array<{ values?: number[] }>;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const TASK_TYPES: Record<EmbeddingTask, string> = {
  [EmbeddingTask.Document]: 'RETRIEVAL_DOCUMENT',
  [EmbeddingTask.Query]: 'RETRIEVAL_QUERY',
};

/**
 * Gemini REST adapter (`models/{model}:batchEmbedContents`). It is the only
 * place that knows Gemini's wire format, task types or error semantics.
 */
export class GeminiEmbeddingAdapter implements EmbeddingProviderPort {
  // Gemini accepts at most 100 requests per batchEmbedContents call.
  readonly maxBatchSize = 100;
  readonly descriptor;
  private readonly logger = new LoggerService(GeminiEmbeddingAdapter.name);
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClientService,
    private readonly config: GeminiEmbeddingConfig,
  ) {
    if (!config.apiKey)
      throw new EmbeddingProviderNotConfiguredError(
        'GEMINI_API_KEY is required for the gemini embedding provider',
      );

    this.model = config.model.replace(/^models\//, '');
    const base = config.baseUrl.replace(/\/+$/, '');
    this.baseUrl = base.endsWith('/models') ? base : `${base}/models`;
    this.descriptor = {
      provider: 'gemini',
      model: this.model,
      dimensions: config.dimensions,
    };
  }

  async embed(texts: string[], task: EmbeddingTask): Promise<number[][]> {
    const url = `${this.baseUrl}/${this.model}:batchEmbedContents`;
    const body = {
      requests: texts.map((text) => ({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        taskType: TASK_TYPES[task],
        outputDimensionality: this.config.dimensions,
      })),
    };

    const query = task === EmbeddingTask.Query;
    const timeout = query
      ? (this.config.queryTimeoutMs ?? this.config.timeoutMs)
      : this.config.timeoutMs;
    const maxAttempts = query
      ? (this.config.queryMaxRetries ?? this.config.maxRetries)
      : this.config.maxRetries;

    const response = await withRetry(
      () =>
        this.http.post<GeminiBatchEmbeddingResponse>(url, body, {
          // Header instead of ?key=: query strings end up in proxy and access logs.
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.config.apiKey,
          },
          timeout,
        }),
      {
        maxAttempts,
        baseDelayMs: this.config.retryBaseDelayMs,
        // A query never waits long between attempts; ingestion can.
        maxDelayMs: query ? 1000 : undefined,
        isRetryable: (error) => this.isRetryable(error),
        retryAfterMs: (error) => this.retryAfterMs(error),
        onRetry: (error, attempt, delayMs) =>
          this.logger.event('Gemini embedding request retry', {
            attempt,
            delayMs: Math.round(delayMs),
            status: (error as AxiosError).response?.status,
            batchSize: texts.length,
          }),
      },
    ).catch((error: unknown) => {
      throw this.toProviderError(error);
    });

    const vectors = (response.embeddings ?? []).map((item) => item.values);
    if (vectors.length !== texts.length || vectors.some((v) => !v?.length))
      throw new InvalidEmbeddingResponseError(
        `Gemini returned ${vectors.length} embeddings for ${texts.length} inputs`,
      );

    return vectors as number[][];
  }

  private isRetryable(error: unknown): boolean {
    const axiosError = error as AxiosError;
    if (!axiosError?.isAxiosError) return false;
    // No response means a network failure or timeout.
    if (!axiosError.response) return true;
    return RETRYABLE_STATUS.has(axiosError.response.status);
  }

  private retryAfterMs(error: unknown): number | undefined {
    const header = (error as AxiosError).response?.headers?.['retry-after'] as
      | string
      | undefined;
    const seconds = header ? Number(header) : Number.NaN;
    return Number.isFinite(seconds) ? seconds * 1000 : undefined;
  }

  private toProviderError(error: unknown): Error {
    const axiosError = error as AxiosError<{ error?: { message?: string } }>;
    if (!axiosError?.isAxiosError) return error as Error;

    const status = axiosError.response?.status;
    const detail =
      axiosError.response?.data?.error?.message ?? axiosError.message;
    return new EmbeddingProviderError(
      `Gemini embedding request failed${status ? ` (HTTP ${status})` : ''}: ${detail}`,
      status,
    );
  }
}
