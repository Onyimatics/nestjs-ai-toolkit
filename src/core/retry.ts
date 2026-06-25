/** Default number of retry attempts when none is configured. */
const DEFAULT_MAX_RETRIES = 3;
/** Default base delay between attempts, in milliseconds. */
const DEFAULT_BASE_DELAY_MS = 200;
/** Default upper bound on any single backoff delay, in milliseconds. */
const DEFAULT_MAX_DELAY_MS = 10_000;

/**
 * Options controlling {@link withRetry}.
 */
export interface RetryOptions {
  /**
   * Maximum number of retries after the initial attempt. A value of `3` means
   * up to four total attempts.
   *
   * @defaultValue 3
   */
  maxRetries?: number;

  /**
   * Base delay between attempts, in milliseconds. The actual delay grows
   * exponentially with each attempt.
   *
   * @defaultValue 200
   */
  baseDelayMs?: number;

  /**
   * Upper bound on any single backoff delay, in milliseconds.
   *
   * @defaultValue 10000
   */
  maxDelayMs?: number;

  /**
   * Predicate deciding whether a thrown error is worth retrying. When it returns
   * `false`, the error is rethrown immediately without further attempts.
   *
   * @defaultValue a predicate that always returns `true`
   */
  shouldRetry?: (error: unknown) => boolean;

  /**
   * Returns a provider-suggested delay, in milliseconds, for the given error,
   * for example parsed from an HTTP `Retry-After` header on a 429 response. When
   * it returns a number, that delay is used for the next attempt instead of the
   * computed exponential backoff, so the toolkit honours the provider's
   * guidance rather than guessing. Return `undefined` to fall back to backoff.
   *
   * @param error The error thrown by the failed attempt.
   */
  retryAfterMs?: (error: unknown) => number | undefined;

  /**
   * Hook invoked after a failed attempt, just before the next one is scheduled.
   * Useful for logging or instrumentation.
   *
   * @param error The error thrown by the failed attempt.
   * @param attempt The 1-based number of the attempt that just failed.
   * @param delayMs The delay, in milliseconds, before the next attempt.
   */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Parse an HTTP `Retry-After` header value into a delay in milliseconds.
 *
 * The header may be either a number of seconds or an HTTP date. Returns
 * `undefined` when the value is missing or cannot be parsed.
 *
 * @param headerValue The raw `Retry-After` header value.
 * @returns The suggested delay in milliseconds, or `undefined`.
 */
export function parseRetryAfterMs(
  headerValue: string | null | undefined,
): number | undefined {
  if (headerValue === null || headerValue === undefined) {
    return undefined;
  }

  const trimmed = headerValue.trim();
  if (trimmed === '') {
    return undefined;
  }

  // Retry-After is most commonly a number of seconds.
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  // Otherwise it may be an HTTP date.
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

/**
 * Safely read a header value from an unknown headers object, supporting both a
 * `Headers`-like object (with a `get` method) and a plain record. Returns
 * `undefined` when the value is absent or not a string.
 */
function readHeaderValue(headers: unknown, name: string): string | undefined {
  if (typeof headers !== 'object' || headers === null) {
    return undefined;
  }

  const record = headers as Record<string, unknown>;
  const getter = record['get'];
  if (typeof getter === 'function') {
    const value: unknown = (getter as (key: string) => unknown).call(
      headers,
      name,
    );
    return typeof value === 'string' ? value : undefined;
  }

  const direct = record[name];
  return typeof direct === 'string' ? direct : undefined;
}

/**
 * Extract a suggested retry delay (ms) from an unknown headers object by reading
 * and parsing its `Retry-After` header. Returns `undefined` when absent.
 *
 * @param headers The error's headers (for example an SDK error's `headers`).
 */
export function retryAfterMsFromHeaders(headers: unknown): number | undefined {
  return parseRetryAfterMs(readHeaderValue(headers, 'retry-after'));
}

/**
 * Resolve a promise after the given number of milliseconds. Resolves
 * synchronously (on the microtask queue) when the delay is non-positive.
 */
function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async operation, retrying it with exponential backoff when it
 * fails. Operates purely on a thunk, so it is provider-agnostic and reusable
 * across the toolkit.
 *
 * @typeParam T The resolved value type of the operation.
 * @param operation The async operation to execute.
 * @param options Retry tuning options.
 * @returns A promise resolving to the operation's result.
 * @throws The last error thrown by the operation once retries are exhausted, or
 * immediately when {@link RetryOptions.shouldRetry} returns `false`.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = options.shouldRetry ?? ((): boolean => true);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const hasAttemptsLeft = attempt < maxRetries;
      if (!hasAttemptsLeft || !shouldRetry(error)) {
        break;
      }

      // Honour a provider-suggested delay (e.g. Retry-After) when present;
      // otherwise fall back to capped exponential backoff.
      const suggested = options.retryAfterMs?.(error);
      const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const delayMs = suggested ?? backoff;
      options.onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
