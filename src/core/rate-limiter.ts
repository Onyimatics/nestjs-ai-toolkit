import {
  RateLimitMode,
  RateLimitOptions,
} from '../interfaces/ai-options.interface';
import { RateLimitExceededError } from './errors';

/** Default behaviour when the limit is reached. */
const DEFAULT_MODE: RateLimitMode = 'queue';
/** Default maximum time a queued request waits before failing. */
const DEFAULT_MAX_WAIT_MS = 30_000;

/** A caller waiting in the queue for capacity. */
interface Waiter {
  resolve: () => void;
  reject: (error: Error) => void;
  /** Absolute time (ms) after which this waiter gives up. */
  deadline: number;
}

/**
 * Client-side request rate limiter.
 *
 * Algorithm: sliding-window log. The limiter records the timestamp of every
 * granted request and counts only those inside the trailing `windowMs` period,
 * so it never admits more than `maxRequests` in any rolling window. This is the
 * safest fit for staying within a provider's published request quota: unlike a
 * fixed window it has no burst-at-the-boundary problem (where up to 2x the limit
 * can slip through around a window edge), and unlike a token bucket it does not
 * permit short bursts above the limit.
 *
 * When the limit is reached, callers are queued in FIFO order and resolved as
 * capacity frees up, up to `maxWaitMs` (after which they fail with a
 * {@link RateLimitExceededError}). In `fail-fast` mode callers are rejected
 * immediately instead of waiting. Because JavaScript runs the bookkeeping
 * synchronously, concurrent callers can never collectively exceed the limit.
 *
 * The limiter is instance based and holds no global state, so each module
 * configuration gets its own independent limiter.
 */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly mode: RateLimitMode;
  private readonly maxWaitMs: number;
  private readonly now: () => number;

  /** Timestamps of granted requests still inside the current window. */
  private readonly hits: number[] = [];
  /** FIFO queue of callers waiting for capacity. */
  private readonly queue: Waiter[] = [];
  /** Pending wake-up timer for processing the queue, if any. */
  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * @param options Limit, window, mode and maximum wait.
   * @param now A clock returning the current time in milliseconds. Defaults to
   * `Date.now`; tests that use fake timers should keep the default so the clock
   * and scheduled timers advance together.
   */
  constructor(options: RateLimitOptions, now: () => number = () => Date.now()) {
    if (options.maxRequests <= 0) {
      throw new Error('RateLimiter: maxRequests must be greater than 0');
    }
    if (options.windowMs <= 0) {
      throw new Error('RateLimiter: windowMs must be greater than 0');
    }
    if (options.maxWaitMs !== undefined && options.maxWaitMs < 0) {
      throw new Error('RateLimiter: maxWaitMs must not be negative');
    }

    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.mode = options.mode ?? DEFAULT_MODE;
    this.maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    this.now = now;
  }

  /**
   * Acquire permission to perform one request.
   *
   * Resolves immediately when capacity is available. Otherwise, in `queue` mode
   * it waits in FIFO order until a slot frees or `maxWaitMs` elapses (then
   * rejects with {@link RateLimitExceededError}); in `fail-fast` mode it rejects
   * immediately.
   */
  acquire(): Promise<void> {
    const current = this.now();
    this.prune(current);

    if (this.queue.length === 0 && this.hits.length < this.maxRequests) {
      this.hits.push(current);
      return Promise.resolve();
    }

    if (this.mode === 'fail-fast') {
      return Promise.reject(
        new RateLimitExceededError(
          `Rate limit reached (${this.maxRequests} request(s) per ${this.windowMs}ms) and fail-fast mode is enabled.`,
        ),
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject, deadline: current + this.maxWaitMs });
      this.scheduleProcessing();
    });
  }

  /**
   * Attempt to consume a slot without waiting. Succeeds only when capacity is
   * free and no callers are already queued ahead.
   *
   * @returns `true` if a slot was consumed, otherwise `false`.
   */
  tryAcquire(): boolean {
    const current = this.now();
    this.prune(current);

    if (this.queue.length === 0 && this.hits.length < this.maxRequests) {
      this.hits.push(current);
      return true;
    }

    return false;
  }

  /**
   * Report how long, in milliseconds, until the next slot frees up.
   *
   * @returns `0` when a slot is currently available.
   */
  timeUntilNextSlot(): number {
    const current = this.now();
    this.prune(current);

    if (this.hits.length < this.maxRequests) {
      return 0;
    }

    const oldest = this.hits[0];
    return Math.max(this.windowMs - (current - oldest), 0);
  }

  /** Drop hits that have aged out of the current window. */
  private prune(current: number): void {
    const threshold = current - this.windowMs;
    while (this.hits.length > 0 && this.hits[0] <= threshold) {
      this.hits.shift();
    }
  }

  /** (Re)schedule the next queue-processing wake-up. */
  private scheduleProcessing(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.queue.length === 0) {
      return;
    }

    const current = this.now();
    this.prune(current);

    const untilSlot =
      this.hits.length < this.maxRequests ? 0 : this.timeUntilNextSlot();
    // The front of a FIFO queue always has the earliest deadline.
    const untilDeadline = Math.max(this.queue[0].deadline - current, 0);
    const wait = Math.min(untilSlot, untilDeadline);

    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.processQueue();
    }, wait);
  }

  /** Serve queued waiters that can proceed and reject any that have timed out. */
  private processQueue(): void {
    const current = this.now();
    this.prune(current);

    // Reject callers that have exceeded their maximum wait.
    while (this.queue.length > 0 && this.queue[0].deadline <= current) {
      const waiter = this.queue.shift();
      waiter?.reject(
        new RateLimitExceededError(
          `Timed out after ${this.maxWaitMs}ms waiting for rate-limit capacity.`,
        ),
      );
    }

    // Grant capacity to as many waiters as the window currently allows.
    while (this.queue.length > 0 && this.hits.length < this.maxRequests) {
      const waiter = this.queue.shift();
      this.hits.push(current);
      waiter?.resolve();
    }

    if (this.queue.length > 0) {
      this.scheduleProcessing();
    }
  }
}
