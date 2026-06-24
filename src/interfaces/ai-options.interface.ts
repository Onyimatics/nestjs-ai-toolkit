import type { ModelPricingMap } from '../core/pricing';

/**
 * The set of LLM providers supported by the toolkit.
 */
export type AiProviderName = 'openai' | 'anthropic';

/**
 * Configuration for built-in, client-side rate limiting.
 */
export interface RateLimitOptions {
  /** Maximum number of requests permitted within {@link windowMs}. */
  maxRequests: number;

  /** Length of the rate-limit window, in milliseconds. */
  windowMs: number;
}

/**
 * Options accepted by {@link AiModule.forRoot} to configure the toolkit.
 */
export interface AiModuleOptions {
  /** Which LLM provider to use. */
  provider: AiProviderName;

  /** The API key for the selected provider. */
  apiKey: string;

  /** The model used for requests that do not specify one explicitly. */
  defaultModel: string;

  /**
   * Maximum number of retry attempts for transient failures.
   *
   * @defaultValue 3
   */
  maxRetries?: number;

  /** Optional client-side rate-limiting configuration. */
  rateLimit?: RateLimitOptions;

  /** Request timeout, in milliseconds. */
  timeout?: number;

  /**
   * Custom model pricing, merged over the built-in pricing registry. Use this to
   * add pricing for new models or correct prices that have changed, without
   * modifying the library. Rates are in US dollars per 1,000 tokens.
   */
  pricing?: ModelPricingMap;

  /**
   * Opt in to accumulating usage totals (tokens, cost, request count) on the
   * {@link AiService} across completed requests. Disabled by default. Read the
   * totals with `AiService.getUsageTotals()`.
   */
  trackUsage?: boolean;
}
