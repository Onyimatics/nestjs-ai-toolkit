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
}
