import {
  parseRetryAfterMs,
  retryAfterMsFromHeaders,
  withRetry,
} from '../../src/core/retry';

describe('withRetry', () => {
  it('returns immediately on success without retrying', async () => {
    const op = jest.fn().mockResolvedValue('ok');

    const result = await withRetry(op, { baseDelayMs: 0 });

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries until the operation succeeds', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('ok');
    const onRetry = jest.fn();

    const result = await withRetry(op, {
      maxRetries: 3,
      baseDelayMs: 0,
      onRetry,
    });

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('throws the last error after exhausting retries', async () => {
    const error = new Error('always');
    const op = jest.fn().mockRejectedValue(error);

    await expect(withRetry(op, { maxRetries: 2, baseDelayMs: 0 })).rejects.toBe(
      error,
    );
    // One initial attempt plus two retries.
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('does not retry when shouldRetry returns false', async () => {
    const error = new Error('fatal');
    const op = jest.fn().mockRejectedValue(error);

    await expect(
      withRetry(op, {
        maxRetries: 5,
        baseDelayMs: 0,
        shouldRetry: () => false,
      }),
    ).rejects.toBe(error);
    expect(op).toHaveBeenCalledTimes(1);
  });

  describe('retry-after coordination', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('waits the suggested retry-after delay instead of exponential backoff', async () => {
      jest.useFakeTimers();
      const op = jest
        .fn()
        .mockRejectedValueOnce(new Error('429'))
        .mockResolvedValue('ok');
      const retryAfterMs = jest.fn().mockReturnValue(5000);

      const promise = withRetry(op, {
        maxRetries: 3,
        baseDelayMs: 100,
        retryAfterMs,
      });

      // Backoff would be 100ms, but the suggested delay is 5000ms.
      await jest.advanceTimersByTimeAsync(100);
      expect(op).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(5000);
      await expect(promise).resolves.toBe('ok');
      expect(op).toHaveBeenCalledTimes(2);
      expect(retryAfterMs).toHaveBeenCalled();
    });
  });
});

describe('parseRetryAfterMs', () => {
  it('parses a seconds value into milliseconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('0.5')).toBe(500);
  });

  it('returns undefined for missing or unparseable values', () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs('')).toBeUndefined();
    expect(parseRetryAfterMs('not a date')).toBeUndefined();
  });
});

describe('retryAfterMsFromHeaders', () => {
  it('reads retry-after from a Headers-like object', () => {
    const headers = new Headers({ 'retry-after': '3' });
    expect(retryAfterMsFromHeaders(headers)).toBe(3000);
  });

  it('reads retry-after from a plain record', () => {
    expect(retryAfterMsFromHeaders({ 'retry-after': '4' })).toBe(4000);
  });

  it('returns undefined when there is no retry-after header', () => {
    expect(retryAfterMsFromHeaders(new Headers())).toBeUndefined();
    expect(retryAfterMsFromHeaders(undefined)).toBeUndefined();
    expect(retryAfterMsFromHeaders(null)).toBeUndefined();
  });
});
