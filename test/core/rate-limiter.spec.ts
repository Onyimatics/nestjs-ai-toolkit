import { RateLimiter } from '../../src/core/rate-limiter';

describe('RateLimiter', () => {
  it('admits up to maxRequests within the window', () => {
    const now = 1000;
    const limiter = new RateLimiter(
      { maxRequests: 2, windowMs: 1000 },
      () => now,
    );

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('frees a slot once the window has elapsed', () => {
    let now = 0;
    const limiter = new RateLimiter(
      { maxRequests: 1, windowMs: 1000 },
      () => now,
    );

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);

    now = 1001;
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('reports the time until the next slot is available', () => {
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
    expect(() => new RateLimiter({ maxRequests: 0, windowMs: 1000 })).toThrow();
    expect(() => new RateLimiter({ maxRequests: 1, windowMs: 0 })).toThrow();
  });
});
