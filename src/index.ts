/**
 * Public entry point for the NestJS AI Toolkit.
 *
 * Everything intended for consumers of the library is re-exported here. Nothing
 * is part of the public API unless it appears in this file.
 */

// NestJS integration
export { AiModule } from './ai.module';
export { AiService } from './ai.service';
export { AI_MODULE_OPTIONS, AI_PROVIDER } from './constants';

// Interfaces and types
export type { Message, MessageRole } from './interfaces/message.interface';
export type {
  CompletionRequest,
  CompletionResponse,
  CompletionUsage,
  CompletionChunk,
} from './interfaces/completion.interface';
export type { AiProvider } from './interfaces/provider.interface';
export type {
  AiModuleOptions,
  AiProviderName,
  RateLimitOptions,
} from './interfaces/ai-options.interface';

// Providers
export { BaseProvider } from './providers/base.provider';

// Errors
export {
  AiError,
  AiAuthenticationError,
  AiRateLimitError,
  AiTimeoutError,
  AiInvalidRequestError,
  AiConnectionError,
  AiProviderError,
} from './core/errors';
export type { AiErrorOptions } from './core/errors';

// Core utilities
export { withRetry } from './core/retry';
export type { RetryOptions } from './core/retry';
export { RateLimiter } from './core/rate-limiter';
export { calculateCostUsd } from './core/cost-calculator';
export type { ModelPricing, TokenCounts } from './core/cost-calculator';

// Helpers
export { estimateTokens, estimateMessageTokens } from './utils/token-counter';
