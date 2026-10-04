export interface RetryOptions {
  /** Total attempts, including the first one. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  isRetryable: (error: unknown) => boolean;
  /** Server-provided wait (e.g. Retry-After), preferred over backoff when present. */
  retryAfterMs?: (error: unknown) => number | undefined;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with full jitter. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const maxDelay = options.maxDelayMs ?? 30_000;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.maxAttempts || !options.isRetryable(error))
        throw error;

      const backoff = Math.random() * options.baseDelayMs * 2 ** (attempt - 1);
      const delay = Math.min(
        options.retryAfterMs?.(error) ?? backoff,
        maxDelay,
      );
      options.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
}
