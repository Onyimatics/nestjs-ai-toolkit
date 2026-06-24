/**
 * Per-model token pricing.
 *
 * Rates are expressed in US dollars per 1,000 tokens, with separate input
 * (prompt) and output (completion) rates because providers charge different
 * prices for each.
 */
export interface ModelPricing {
  /** USD cost per 1,000 prompt (input) tokens. */
  promptCostPer1k: number;

  /** USD cost per 1,000 completion (output) tokens. */
  completionCostPer1k: number;
}

/**
 * A map of model id to its {@link ModelPricing}. Used for the built-in registry
 * and for custom overrides supplied through module options.
 */
export type ModelPricingMap = Record<string, ModelPricing>;

/**
 * The single source of truth for built-in model pricing.
 *
 * - All prices are in US dollars per 1,000 tokens.
 * - Each model has separate input (prompt) and output (completion) rates.
 * - Verified against the official OpenAI and Anthropic pricing pages in
 *   June 2026.
 * - Prices and model identifiers change frequently. Consumers should verify
 *   against the provider pricing pages, and can override any price via the
 *   `pricing` option in AiModuleOptions without editing this file.
 *
 * Sources:
 *   OpenAI:    https://openai.com/api/pricing
 *   Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 *
 * Anything not listed here is treated as unknown pricing (see
 * {@link resolveModelPricing}).
 */
export const DEFAULT_MODEL_PRICING: ModelPricingMap = {
  // OpenAI
  'gpt-4o': { promptCostPer1k: 0.0025, completionCostPer1k: 0.01 },
  'gpt-4o-mini': { promptCostPer1k: 0.00015, completionCostPer1k: 0.0006 },
  'gpt-4.1': { promptCostPer1k: 0.002, completionCostPer1k: 0.008 },
  'gpt-4.1-mini': { promptCostPer1k: 0.0004, completionCostPer1k: 0.0016 },
  'gpt-4.1-nano': { promptCostPer1k: 0.0001, completionCostPer1k: 0.0004 },
  'gpt-4-turbo': { promptCostPer1k: 0.01, completionCostPer1k: 0.03 },
  'gpt-4': { promptCostPer1k: 0.03, completionCostPer1k: 0.06 },
  'gpt-3.5-turbo': { promptCostPer1k: 0.0005, completionCostPer1k: 0.0015 },

  // Anthropic - current generation (verified June 2026)
  'claude-opus-4-8': { promptCostPer1k: 0.005, completionCostPer1k: 0.025 },
  'claude-opus-4-7': { promptCostPer1k: 0.005, completionCostPer1k: 0.025 },
  'claude-sonnet-4-6': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  'claude-haiku-4-5': { promptCostPer1k: 0.001, completionCostPer1k: 0.005 },
  'claude-haiku-4-5-20251001': {
    promptCostPer1k: 0.001,
    completionCostPer1k: 0.005,
  },
  // Newer top-tier models such as Claude Fable 5 and Claude Mythos 5 are
  // intentionally omitted from the defaults: their availability has been
  // unstable and they price above the Opus tier. Supply them through the
  // `pricing` override in AiModuleOptions if you use them.

  // Anthropic - legacy (more expensive, migration recommended)
  'claude-3-opus': { promptCostPer1k: 0.015, completionCostPer1k: 0.075 },
  'claude-3-5-sonnet': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  'claude-3-5-haiku': { promptCostPer1k: 0.0008, completionCostPer1k: 0.004 },
  'claude-3-haiku': { promptCostPer1k: 0.00025, completionCostPer1k: 0.00125 },
};

/**
 * Resolve the pricing for a model.
 *
 * Custom `overrides` are merged over the built-in {@link DEFAULT_MODEL_PRICING}
 * (an override wins for the same key), so a developer can add new models or
 * correct prices without touching provider code. Lookup tries an exact match
 * first, then the longest matching key prefix (so dated snapshots such as
 * `gpt-4o-2024-08-06` or `claude-3-5-sonnet-20241022` resolve to their base
 * model).
 *
 * @param model The model id to price.
 * @param overrides Optional custom pricing, merged over the built-in registry.
 * @returns The resolved {@link ModelPricing}, or `null` when the model has no
 * known pricing so callers can surface that pricing was unavailable rather than
 * assume a cost of zero.
 */
export function resolveModelPricing(
  model: string,
  overrides?: ModelPricingMap,
): ModelPricing | null {
  const table: ModelPricingMap = overrides
    ? { ...DEFAULT_MODEL_PRICING, ...overrides }
    : DEFAULT_MODEL_PRICING;

  const exact = table[model];
  if (exact) {
    return exact;
  }

  const prefixMatch = Object.keys(table)
    .filter((known) => model.startsWith(known))
    .sort((a, b) => b.length - a.length)[0];

  return prefixMatch ? table[prefixMatch] : null;
}
