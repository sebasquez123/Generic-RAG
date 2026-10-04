import type { AxiosError } from 'axios';
import type { RagConfig } from '~/config';
import type { HttpClientService } from '~/modules/6_http';
import { GeminiEmbeddingAdapter } from '../adapters/gemini/gemini-embedding.adapter';
import { HashingEmbeddingAdapter } from '../adapters/local/hashing-embedding.adapter';
import {
  EmbeddingTask,
  type EmbeddingProviderPort,
} from '../domain/ports/embedding-provider.port';
import { EmbeddingService } from './embedding.service';

const config = { embedding: { batchSize: 2 } } as unknown as RagConfig;

describe('EmbeddingService', () => {
  const fakeProvider = (vectorFor: (text: string) => number[]) => {
    const calls: { texts: string[]; task: EmbeddingTask }[] = [];
    const provider: EmbeddingProviderPort = {
      descriptor: { provider: 'fake', model: 'm1', dimensions: 3 },
      maxBatchSize: 100,
      embed: (texts, task) => {
        calls.push({ texts, task });
        return Promise.resolve(texts.map(vectorFor));
      },
    };
    return { provider, calls };
  };

  it('batches document embeddings, keeps order and reports progress', async () => {
    const { provider, calls } = fakeProvider((text) => [text.length, 1, 0]);
    const service = new EmbeddingService(provider, config);
    const progress: number[] = [];

    const vectors = await service.embedDocuments(
      ['a', 'bb', 'ccc', 'dddd', 'eeeee'],
      (done) => {
        progress.push(done);
      },
    );

    expect(vectors.map((vector) => vector[0])).toEqual([1, 2, 3, 4, 5]);
    expect(calls.map((call) => call.texts.length)).toEqual([2, 2, 1]);
    expect(calls.every((call) => call.task === EmbeddingTask.Document)).toBe(
      true,
    );
    expect(progress).toEqual([2, 4, 5]);
    expect(service.descriptor.version).toBe('fake:m1:3');
  });

  it('uses the query task for queries', async () => {
    const { provider, calls } = fakeProvider(() => [0, 1, 0]);
    await new EmbeddingService(provider, config).embedQuery('  hola  ');
    expect(calls[0]).toEqual({ texts: ['hola'], task: EmbeddingTask.Query });
  });

  it('refuses empty inputs and invalid vectors', async () => {
    const { provider } = fakeProvider(() => [1, 2]);
    const service = new EmbeddingService(provider, config);
    await expect(service.embedDocuments(['ok', '  '])).rejects.toMatchObject({
      code: 'EMBEDDING_EMPTY_INPUT',
    });
    await expect(service.embedQuery('texto')).rejects.toThrow(
      'dimension mismatch',
    );

    const nan = new EmbeddingService(
      fakeProvider(() => [1, Number.NaN, 0]).provider,
      config,
    );
    await expect(nan.embedQuery('texto')).rejects.toThrow('non-finite');
  });
});

describe('GeminiEmbeddingAdapter', () => {
  const baseConfig = {
    apiKey: 'test-key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
    model: 'models/gemini-embedding-001',
    dimensions: 3,
    timeoutMs: 1000,
    maxRetries: 3,
    retryBaseDelayMs: 1,
  };

  const axiosError = (status: number, headers: Record<string, string> = {}) =>
    Object.assign(new Error(`HTTP ${status}`), {
      isAxiosError: true,
      response: {
        status,
        headers,
        data: { error: { message: `upstream ${status}` } },
      },
    }) as unknown as AxiosError;

  it('sends a batchEmbedContents request with task type and dimensions', async () => {
    const post = jest.fn().mockResolvedValue({
      embeddings: [{ values: [1, 0, 0] }, { values: [0, 1, 0] }],
    });
    const adapter = new GeminiEmbeddingAdapter(
      { post } as unknown as HttpClientService,
      baseConfig,
    );

    const vectors = await adapter.embed(['uno', 'dos'], EmbeddingTask.Document);

    expect(vectors).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents',
    );
    expect(body.requests[0]).toEqual({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text: 'uno' }] },
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: 3,
    });
    expect(options.params).toEqual({ key: 'test-key' });
  });

  it('retries rate limits and transient errors, then succeeds', async () => {
    const post = jest
      .fn()
      .mockRejectedValueOnce(axiosError(429, { 'retry-after': '0' }))
      .mockRejectedValueOnce(axiosError(503))
      .mockResolvedValue({ embeddings: [{ values: [1, 1, 1] }] });
    const adapter = new GeminiEmbeddingAdapter(
      { post } as unknown as HttpClientService,
      baseConfig,
    );

    await expect(adapter.embed(['x'], EmbeddingTask.Query)).resolves.toEqual([
      [1, 1, 1],
    ]);
    expect(post).toHaveBeenCalledTimes(3);
    expect(post.mock.calls[0][1].requests[0].taskType).toBe('RETRIEVAL_QUERY');
  });

  it('does not retry client errors and never leaks the key in the error', async () => {
    const post = jest.fn().mockRejectedValue(axiosError(400));
    const adapter = new GeminiEmbeddingAdapter(
      { post } as unknown as HttpClientService,
      baseConfig,
    );

    const error = (await adapter
      .embed(['x'], EmbeddingTask.Query)
      .catch((e: unknown) => e)) as Error;
    expect(post).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({
      code: 'EMBEDDING_PROVIDER_REQUEST_FAILED',
      status: 400,
    });
    expect(error.message).toContain('upstream 400');
    expect(error.message).not.toContain('test-key');
  });

  it('rejects responses with a wrong number of vectors', async () => {
    const post = jest
      .fn()
      .mockResolvedValue({ embeddings: [{ values: [1, 0, 0] }] });
    const adapter = new GeminiEmbeddingAdapter(
      { post } as unknown as HttpClientService,
      baseConfig,
    );
    await expect(
      adapter.embed(['a', 'b'], EmbeddingTask.Document),
    ).rejects.toMatchObject({
      code: 'EMBEDDING_INVALID_PROVIDER_RESPONSE',
    });
  });

  it('requires an API key', () => {
    expect(
      () =>
        new GeminiEmbeddingAdapter({} as HttpClientService, {
          ...baseConfig,
          apiKey: '',
        }),
    ).toThrow('GEMINI_API_KEY');
  });
});

describe('HashingEmbeddingAdapter', () => {
  it('is deterministic, normalised and lexically sensitive', async () => {
    const adapter = new HashingEmbeddingAdapter(64);
    const [a, b, c] = await adapter.embed([
      'facturación anual',
      'Facturacion  anual',
      'política de vacaciones',
    ]);
    const dot = (x: number[], y: number[]) =>
      x.reduce((sum, value, index) => sum + value * y[index], 0);
    expect(dot(a, a)).toBeCloseTo(1);
    expect(dot(a, b)).toBeCloseTo(1);
    expect(dot(a, c)).toBeLessThan(0.5);
  });
});
