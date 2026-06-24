import { withRetry } from '../../src/core/retry';

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
});
