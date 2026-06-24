/**
 * Per-1,000-token pricing for a model, expressed in US dollars.
 */
export interface ModelPricing {
  /** USD cost per 1,000 prompt (input) tokens. */
  promptCostPer1k: number;

  /** USD cost per 1,000 completion (output) tokens. */
  completionCostPer1k: number;
}

/**
 * The token counts used to compute a cost.
 */
export interface TokenCounts {
  /** Number of prompt (input) tokens. */
  promptTokens: number;

  /** Number of completion (output) tokens. */
  completionTokens: number;
}

/** Round a currency amount to micro-dollar precision (six decimal places). */
function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Calculate the estimated cost, in US dollars, for a request given its token
 * usage and the pricing of the model used.
 *
 * The calculator is provider-agnostic: callers supply the pricing, so the same
 * function serves every provider.
 *
 * @param tokens The prompt and completion token counts.
 * @param pricing The per-1,000-token pricing for the model.
 * @returns The estimated cost in US dollars, rounded to micro-dollar precision.
 */
export function calculateCostUsd(
  tokens: TokenCounts,
  pricing: ModelPricing,
): number {
  const promptCost = (tokens.promptTokens / 1000) * pricing.promptCostPer1k;
  const completionCost =
    (tokens.completionTokens / 1000) * pricing.completionCostPer1k;

  return roundCurrency(promptCost + completionCost);
}

/** Pricing used when a model is not present in a provider's pricing table. */
const ZERO_PRICING: ModelPricing = {
  promptCostPer1k: 0,
  completionCostPer1k: 0,
};

/**
 * Resolve the pricing for a model from a provider's pricing table.
 *
 * Tries an exact match first, then the longest matching key prefix (so dated
 * snapshots such as `gpt-4o-2024-08-06` or `claude-3-5-sonnet-20241022` resolve
 * to their base model), and finally falls back to zero cost for an unknown
 * model so it degrades gracefully rather than throwing.
 *
 * The matching algorithm is provider-agnostic; only the table differs, so every
 * provider shares this one implementation.
 *
 * @param table A provider's per-1,000-token pricing, keyed by model id.
 * @param model The model id to price.
 * @returns The resolved {@link ModelPricing}.
 */
export function resolveModelPricing(
  table: Record<string, ModelPricing>,
  model: string,
): ModelPricing {
  const exact = table[model];
  if (exact) {
    return exact;
  }

  const prefixMatch = Object.keys(table)
    .filter((known) => model.startsWith(known))
    .sort((a, b) => b.length - a.length)[0];

  return prefixMatch ? table[prefixMatch] : ZERO_PRICING;
}
