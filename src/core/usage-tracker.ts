import { CompletionUsage } from '../interfaces/completion.interface';
import { roundCurrency } from './cost-calculator';

/**
 * A snapshot of usage totals accumulated by a {@link UsageTracker}.
 */
export interface UsageTotals {
  /** Total prompt (input) tokens across all recorded requests. */
  totalPromptTokens: number;

  /** Total completion (output) tokens across all recorded requests. */
  totalCompletionTokens: number;

  /** Total tokens across all recorded requests. */
  totalTokens: number;

  /**
   * Total estimated cost in US dollars. Requests whose model had unknown
   * pricing contribute nothing here and are counted in
   * {@link requestsWithUnknownCost} instead, so the total is never silently
   * inflated or deflated by an unpriced request.
   */
  totalEstimatedCostUsd: number;

  /** Number of requests recorded. */
  requestCount: number;

  /** Number of recorded requests whose model had no known pricing. */
  requestsWithUnknownCost: number;
}

/**
 * Accumulates usage and cost totals across multiple requests.
 *
 * This is opt-in and instance based: create one where you need it (or enable it
 * on {@link AiService} via the `trackUsage` option) and read the running totals
 * with {@link getTotals}. It holds no shared or global mutable state.
 */
export class UsageTracker {
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalEstimatedCostUsd = 0;
  private requestCount = 0;
  private requestsWithUnknownCost = 0;

  /**
   * Record one request's usage into the running totals.
   *
   * @param usage The usage reported for a single completed request.
   */
  record(usage: CompletionUsage): void {
    this.totalPromptTokens += usage.promptTokens;
    this.totalCompletionTokens += usage.completionTokens;
    this.requestCount += 1;

    if (usage.estimatedCostUsd === null) {
      this.requestsWithUnknownCost += 1;
    } else {
      this.totalEstimatedCostUsd += usage.estimatedCostUsd;
    }
  }

  /**
   * Read a snapshot of the current totals. The returned object is a copy, so
   * mutating it does not affect the tracker's internal state.
   */
  getTotals(): UsageTotals {
    return {
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      totalTokens: this.totalPromptTokens + this.totalCompletionTokens,
      totalEstimatedCostUsd: roundCurrency(this.totalEstimatedCostUsd),
      requestCount: this.requestCount,
      requestsWithUnknownCost: this.requestsWithUnknownCost,
    };
  }

  /** Reset all totals back to zero. */
  reset(): void {
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalEstimatedCostUsd = 0;
    this.requestCount = 0;
    this.requestsWithUnknownCost = 0;
  }
}
