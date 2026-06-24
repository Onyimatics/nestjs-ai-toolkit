import { RateLimitOptions } from '../interfaces/ai-options.interface';

/**
 * A sliding-window rate limiter.
 *
 * It admits at most `maxRequests` acquisitions within any `windowMs` period.
 * The limiter is provider-agnostic: it gates calls without knowing anything
 * about the underlying request, so it works uniformly across every provider.
 */
export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly hits: number[] = [];
  private readonly now: () => number;

  /**
   * @param options The maximum number of requests and the window length.
   * @param now A clock function returning the current time in milliseconds.
   * Injectable to keep the limiter deterministic in tests.
   */
  constructor(options: RateLimitOptions, now: () => number = () => Date.now()) {
    if (options.maxRequests <= 0) {
      throw new Error('RateLimiter: maxRequests must be greater than 0');
    }
    if (options.windowMs <= 0) {
      throw new Error('RateLimiter: windowMs must be greater than 0');
    }

    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.now = now;
  }

  /**
   * Attempt to consume a slot without waiting.
   *
   * @returns `true` if a slot was available and has been consumed, otherwise
   * `false`.
   */
  tryAcquire(): boolean {
    const current = this.now();
    this.prune(current);

    if (this.hits.length < this.maxRequests) {
      this.hits.push(current);
      return true;
    }

    return false;
  }

  /**
   * Acquire a slot, waiting until one becomes available. Resolves immediately
   * when capacity is available.
   */
  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      await this.sleep(this.timeUntilNextSlot());
    }
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

  /** Resolve after `ms` milliseconds; resolves immediately when non-positive. */
  private sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
