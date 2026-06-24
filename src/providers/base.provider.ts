import { RateLimiter } from '../core/rate-limiter';
import { withRetry } from '../core/retry';
import { AiModuleOptions } from '../interfaces/ai-options.interface';
import {
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
} from '../interfaces/completion.interface';
import { AiProvider } from '../interfaces/provider.interface';

/**
 * Shared base class for all LLM provider implementations.
 *
 * Concrete providers (OpenAI, Anthropic, ...) extend this class and implement
 * {@link complete} and {@link stream}. The base owns the cross-cutting wiring
 * that every provider needs (model resolution, optional rate limiting and
 * exponential-backoff retries), so vendor-specific code in the subclasses stays
 * focused on translating requests, responses and errors. The retry and
 * rate-limit logic therefore lives here exactly once, never duplicated per
 * provider.
 */
export abstract class BaseProvider implements AiProvider {
  /** Optional client-side rate limiter, created when configured in options. */
  protected readonly rateLimiter?: RateLimiter;

  protected constructor(protected readonly options: AiModuleOptions) {
    if (options.rateLimit) {
      this.rateLimiter = new RateLimiter(options.rateLimit);
    }
  }

  /**
   * Produce a single, complete chat completion.
   *
   * @param request The completion request to fulfil.
   */
  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Produce a chat completion as a stream of incremental content chunks.
   *
   * @param request The completion request to fulfil.
   */
  abstract stream(request: CompletionRequest): AsyncIterable<CompletionChunk>;

  /**
   * Resolve the model to use for a request, falling back to the module's
   * configured `defaultModel` when the request does not specify one.
   *
   * @param request The incoming completion request.
   * @returns The model identifier to send to the provider.
   */
  protected resolveModel(request: CompletionRequest): string {
    return request.model ?? this.options.defaultModel;
  }

  /**
   * Acquire a rate-limit slot (when configured) and run an operation with
   * exponential-backoff retries. Shared by every provider so the retry and
   * rate-limit wiring is defined in a single place.
   *
   * @typeParam T The resolved value type of the operation.
   * @param operation The async SDK call to execute.
   * @returns A promise resolving to the operation's result.
   */
  protected run<T>(operation: () => Promise<T>): Promise<T> {
    return withRetry(
      async () => {
        if (this.rateLimiter) {
          await this.rateLimiter.acquire();
        }
        return operation();
      },
      {
        maxRetries: this.options.maxRetries,
        shouldRetry: (error) => this.isRetryable(error),
      },
    );
  }

  /**
   * Whether an error thrown by the underlying SDK is transient and worth
   * retrying. Providers override this with SDK-specific logic; by default
   * nothing is retried.
   *
   * @param _error The error thrown by a failed operation.
   */
  protected isRetryable(_error: unknown): boolean {
    return false;
  }
}
