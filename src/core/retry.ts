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

      const delayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      options.onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
