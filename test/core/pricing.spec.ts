import {
  DEFAULT_MODEL_PRICING,
  resolveModelPricing,
} from '../../src/core/pricing';

describe('pricing registry', () => {
  it('exposes separate input and output rates for known models', () => {
    const pricing = resolveModelPricing('gpt-4o');
    expect(pricing).not.toBeNull();
    expect(pricing?.promptCostPer1k).toBeGreaterThan(0);
    expect(pricing?.completionCostPer1k).toBeGreaterThan(0);
    // Input and output are priced differently.
    expect(pricing?.completionCostPer1k).not.toBe(pricing?.promptCostPer1k);
  });

  it('includes both OpenAI and Anthropic models', () => {
    expect(resolveModelPricing('gpt-4o')).not.toBeNull();
    expect(resolveModelPricing('gpt-4o-mini')).not.toBeNull();
    expect(resolveModelPricing('claude-sonnet-4')).not.toBeNull();
    expect(resolveModelPricing('claude-3-5-haiku')).not.toBeNull();
  });

  it('matches dated snapshot ids by longest prefix', () => {
    expect(resolveModelPricing('gpt-4o-2024-08-06')).toEqual(
      DEFAULT_MODEL_PRICING['gpt-4o'],
    );
    expect(resolveModelPricing('claude-3-5-sonnet-20241022')).toEqual(
      DEFAULT_MODEL_PRICING['claude-3-5-sonnet'],
    );
    // The longer, more specific prefix wins over a shorter one.
    expect(resolveModelPricing('gpt-4o-mini-2024-07-18')).toEqual(
      DEFAULT_MODEL_PRICING['gpt-4o-mini'],
    );
  });

  it('returns null for an unknown model', () => {
    expect(resolveModelPricing('totally-unknown-model-xyz')).toBeNull();
  });

  it('lets custom pricing override a built-in model', () => {
    const overrides = {
      'gpt-4o': { promptCostPer1k: 99, completionCostPer1k: 100 },
    };
    expect(resolveModelPricing('gpt-4o', overrides)).toEqual(
      overrides['gpt-4o'],
    );
  });

  it('adds new models via overrides while built-ins still resolve', () => {
    const overrides = {
      'house-model': { promptCostPer1k: 1, completionCostPer1k: 2 },
    };
    expect(resolveModelPricing('house-model', overrides)).toEqual(
      overrides['house-model'],
    );
    expect(resolveModelPricing('gpt-4o', overrides)).toEqual(
      DEFAULT_MODEL_PRICING['gpt-4o'],
    );
  });
});
