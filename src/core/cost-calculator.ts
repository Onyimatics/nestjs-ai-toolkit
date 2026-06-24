import { CompletionUsage } from '../interfaces/completion.interface';
import { ModelPricing, ModelPricingMap, resolveModelPricing } from './pricing';

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
export function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Calculate the estimated cost, in US dollars, for a request given its token
 * usage and the pricing of the model used. Input (prompt) and output
 * (completion) tokens are priced separately using the model's distinct rates.
 *
 * @param tokens The prompt and completion token counts.
 * @param pricing The model's pricing, or `null` when it is unknown.
 * @returns The estimated cost in US dollars (rounded to micro-dollar precision),
 * or `null` when `pricing` is `null`. Returning `null` rather than `0` keeps an
 * unknown model from being silently reported as free.
 */
export function calculateCostUsd(
  tokens: TokenCounts,
  pricing: ModelPricing | null,
): number | null {
  if (pricing === null) {
    return null;
  }

  const promptCost = (tokens.promptTokens / 1000) * pricing.promptCostPer1k;
  const completionCost =
    (tokens.completionTokens / 1000) * pricing.completionCostPer1k;

  return roundCurrency(promptCost + completionCost);
}

/**
 * Build a complete {@link CompletionUsage} for a request: token counts plus an
 * estimated cost resolved from the pricing registry (with optional overrides).
 *
 * This is the single place providers compute usage, so pricing logic is shared
 * rather than duplicated. `estimatedCostUsd` is `null` when the model's pricing
 * is unknown.
 *
 * @param model The model the request ran against.
 * @param promptTokens Prompt (input) tokens reported by the provider.
 * @param completionTokens Completion (output) tokens reported by the provider.
 * @param pricingOverrides Optional custom pricing merged over the built-in
 * registry.
 * @returns The unified usage object for the request.
 */
export function buildUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
  pricingOverrides?: ModelPricingMap,
): CompletionUsage {
  const pricing = resolveModelPricing(model, pricingOverrides);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimatedCostUsd: calculateCostUsd(
      { promptTokens, completionTokens },
      pricing,
    ),
  };
}
