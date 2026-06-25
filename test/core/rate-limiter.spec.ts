import { RateLimitExceededError } from '../../src/core/errors';
import { RateLimiter } from '../../src/core/rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('within the limit', () => {
    it('admits requests up to the limit immediately', async () => {
      const limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });

      await expect(limiter.acquire()).resolves.toBeUndefined();
      await expect(limiter.acquire()).resolves.toBeUndefined();
      await expect(limiter.acquire()).resolves.toBeUndefined();
    });
  });

  describe('queue mode (default)', () => {
    it('queues an over-limit request and resolves it when capacity frees', async () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 1000 });
      await limiter.acquire(); // consumes the only slot at t=0

      let resolved = false;
      const pending = limiter.acquire().then(() => {
        resolved = true;
      });

      await Promise.resolve();
      expect(resolved).toBe(false);

      // The slot frees once the first hit ages out of the 1000ms window.
      await jest.advanceTimersByTimeAsync(1000);
      expect(resolved).toBe(true);
      await pending;
    });

    it('throws RateLimitExceededError when the max wait elapses first', async () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 10_000,
        maxWaitMs: 2000,
      });
      await limiter.acquire(); // slot taken at t=0, would free at t=10000

      const pending = limiter.acquire();
      const assertion = expect(pending).rejects.toBeInstanceOf(
        RateLimitExceededError,
      );

      // The 2000ms deadline passes well before the slot frees at 10000ms.
      await jest.advanceTimersByTimeAsync(2000);
      await assertion;
    });
  });

  describe('fail-fast mode', () => {
    it('rejects immediately instead of waiting', async () => {
      const limiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 1000,
        mode: 'fail-fast',
      });
      await limiter.acquire();

      await expect(limiter.acquire()).rejects.toBeInstanceOf(
        RateLimitExceededError,
      );
    });
  });

  describe('concurrency', () => {
    it('never admits more than the limit per window under concurrent load', async () => {
      const limiter = new RateLimiter({
        maxRequests: 3,
        windowMs: 1000,
        maxWaitMs: 60_000,
      });

      const grantTimes: number[] = [];
      const all = Promise.all(
        Array.from({ length: 10 }, () =>
          limiter.acquire().then(() => {
            grantTimes.push(Date.now());
          }),
        ),
      );

      await jest.advanceTimersByTimeAsync(0);
      expect(grantTimes).toHaveLength(3);

      await jest.advanceTimersByTimeAsync(1000);
      expect(grantTimes).toHaveLength(6);

      await jest.advanceTimersByTimeAsync(1000);
      expect(grantTimes).toHaveLength(9);

      await jest.advanceTimersByTimeAsync(1000);
      expect(grantTimes).toHaveLength(10);

      await all;

      // No rolling window of windowMs ever held more than maxRequests grants.
      for (const start of grantTimes) {
        const inWindow = grantTimes.filter(
          (t) => t >= start && t < start + 1000,
        ).length;
        expect(inWindow).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('synchronous helpers', () => {
    it('tryAcquire consumes a slot only when capacity is free', () => {
      let now = 0;
      const limiter = new RateLimiter(
        { maxRequests: 2, windowMs: 1000 },
        () => now,
      );

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(false);

      now = 1001;
      expect(limiter.tryAcquire()).toBe(true);
    });

    it('reports the time until the next slot frees', () => {
      let now = 0;
      const limiter = new RateLimiter(
        { maxRequests: 1, windowMs: 1000 },
        () => now,
      );

      limiter.tryAcquire();
      now = 400;
      expect(limiter.timeUntilNextSlot()).toBe(600);
    });

    it('rejects invalid configuration', () => {
      expect(
        () => new RateLimiter({ maxRequests: 0, windowMs: 1000 }),
      ).toThrow();
      expect(() => new RateLimiter({ maxRequests: 1, windowMs: 0 })).toThrow();
      expect(
        () =>
          new RateLimiter({ maxRequests: 1, windowMs: 1000, maxWaitMs: -1 }),
      ).toThrow();
    });
  });
});
