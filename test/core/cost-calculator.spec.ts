import { buildUsage, calculateCostUsd } from '../../src/core/cost-calculator';
import { DEFAULT_MODEL_PRICING } from '../../src/core/pricing';

describe('calculateCostUsd', () => {
  it('prices input and output tokens separately and sums them', () => {
    const cost = calculateCostUsd(
      { promptTokens: 1000, completionTokens: 2000 },
      { promptCostPer1k: 0.005, completionCostPer1k: 0.015 },
    );

    // 1k prompt * 0.005 + 2k completion * 0.015 = 0.005 + 0.03
    expect(cost).toBe(0.035);
  });

  it('returns zero when there is no usage but pricing is known', () => {
    const cost = calculateCostUsd(
      { promptTokens: 0, completionTokens: 0 },
      { promptCostPer1k: 1, completionCostPer1k: 1 },
    );

    expect(cost).toBe(0);
  });

  it('rounds to micro-dollar precision', () => {
    const cost = calculateCostUsd(
      { promptTokens: 1, completionTokens: 0 },
      { promptCostPer1k: 0.0011112, completionCostPer1k: 0 },
    );

    // 0.0011112 / 1000 = 0.0000011112 -> rounded to 0.000001
    expect(cost).toBe(0.000001);
  });

  it('returns null (not zero) when pricing is unavailable', () => {
    const cost = calculateCostUsd(
      { promptTokens: 1000, completionTokens: 1000 },
      null,
    );

    expect(cost).toBeNull();
  });
});

describe('buildUsage', () => {
  it('prices a known model from the registry with separate rates', () => {
    const usage = buildUsage('gpt-4o', 1000, 2000);

    // gpt-4o: (1k in * 0.0025) + (2k out * 0.01) = 0.0025 + 0.02 = 0.0225
    expect(usage).toEqual({
      promptTokens: 1000,
      completionTokens: 2000,
      totalTokens: 3000,
      estimatedCostUsd: 0.0225,
    });
  });

  it('reports null cost for an unknown model but still totals tokens', () => {
    const usage = buildUsage('unknown-model-zzz', 1000, 2000);

    expect(usage.estimatedCostUsd).toBeNull();
    expect(usage.totalTokens).toBe(3000);
  });

  it('applies custom pricing overrides over the built-in registry', () => {
    const usage = buildUsage('gpt-4o', 1000, 1000, {
      'gpt-4o': { promptCostPer1k: 1, completionCostPer1k: 2 },
    });

    // overridden: (1k * 1) + (1k * 2) = 3, not the built-in price
    expect(usage.estimatedCostUsd).toBe(3);
    expect(usage.estimatedCostUsd).not.toBe(
      DEFAULT_MODEL_PRICING['gpt-4o'].promptCostPer1k,
    );
  });
});
