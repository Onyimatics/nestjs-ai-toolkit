import { calculateCostUsd } from '../../src/core/cost-calculator';

describe('calculateCostUsd', () => {
  it('computes cost from prompt and completion tokens', () => {
    const cost = calculateCostUsd(
      { promptTokens: 1000, completionTokens: 2000 },
      { promptCostPer1k: 0.005, completionCostPer1k: 0.015 },
    );

    // 1k prompt * 0.005 + 2k completion * 0.015 = 0.005 + 0.03
    expect(cost).toBeCloseTo(0.035, 6);
  });

  it('returns zero when there is no usage', () => {
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
});
