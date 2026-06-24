import {
  estimateMessageTokens,
  estimateTokens,
} from '../../src/utils/token-counter';

describe('token-counter', () => {
  it('estimates zero tokens for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates tokens from character length', () => {
    // 8 characters / 4 chars-per-token = 2 tokens.
    expect(estimateTokens('12345678')).toBe(2);
  });

  it('rounds partial tokens up', () => {
    // 5 characters / 4 = 1.25 -> 2 tokens.
    expect(estimateTokens('12345')).toBe(2);
  });

  it('includes per-message overhead when summing messages', () => {
    const tokens = estimateMessageTokens([
      { role: 'system', content: '1234' }, // 1 token + 4 overhead
      { role: 'user', content: '12345678' }, // 2 tokens + 4 overhead
    ]);

    expect(tokens).toBe(1 + 4 + 2 + 4);
  });
});
