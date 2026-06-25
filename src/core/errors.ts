/**
 * Options accepted by {@link AiError} and its subclasses.
 */
export interface AiErrorOptions {
  /** The provider that produced the error (for example `"openai"`). */
  provider?: string;

  /** The underlying error that triggered this one, preserved for debugging. */
  cause?: unknown;

  /** The HTTP status code associated with the error, when one is available. */
  status?: number;
}

/**
 * Base class for every error thrown by the toolkit.
 *
 * Catch {@link AiError} to handle any library failure generically, or catch a
 * specific subclass ({@link AiAuthenticationError}, {@link AiRateLimitError},
 * {@link AiTimeoutError}, ...) to react to a particular failure mode. The
 * originating SDK error is preserved on the standard `cause` property.
 */
export class AiError extends Error {
  /** The provider that produced the error, when known. */
  readonly provider?: string;

  /** The HTTP status code associated with the error, when available. */
  readonly status?: number;

  constructor(message: string, options: AiErrorOptions = {}) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = new.target.name;
    this.provider = options.provider;
    this.status = options.status;
  }
}

/**
 * Raised when the provider rejects the request because of invalid or missing
 * credentials.
 */
export class AiAuthenticationError extends AiError {}

/**
 * Raised when the provider's rate limit or quota has been exceeded.
 */
export class AiRateLimitError extends AiError {}

/**
 * Raised by the toolkit's own client-side rate limiter when a request cannot be
 * admitted: either the configured maximum wait elapsed while queued, or the
 * limiter is configured in fail-fast mode and was already at capacity. This is
 * distinct from {@link AiRateLimitError}, which represents a rate limit reported
 * by the provider's API.
 */
export class RateLimitExceededError extends AiError {}

/**
 * Raised when a request to the provider exceeds its configured timeout.
 */
export class AiTimeoutError extends AiError {}

/**
 * Raised when the request itself is malformed or otherwise rejected as invalid.
 */
export class AiInvalidRequestError extends AiError {}

/**
 * Raised when the toolkit cannot establish a network connection to the provider.
 */
export class AiConnectionError extends AiError {}

/**
 * Raised for any other provider-side error that has no more specific type.
 */
export class AiProviderError extends AiError {}
