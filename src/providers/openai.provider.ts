import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import {
  calculateCostUsd,
  ModelPricing,
  resolveModelPricing,
} from '../core/cost-calculator';
import {
  AiAuthenticationError,
  AiConnectionError,
  AiError,
  AiInvalidRequestError,
  AiProviderError,
  AiRateLimitError,
  AiTimeoutError,
} from '../core/errors';
import { AiModuleOptions } from '../interfaces/ai-options.interface';
import {
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
} from '../interfaces/completion.interface';
import { Message } from '../interfaces/message.interface';
import { BaseProvider } from './base.provider';

/** Identifier used when tagging errors and selecting pricing for this provider. */
const PROVIDER_NAME = 'openai';

/**
 * Known OpenAI model pricing, in US dollars per 1,000 tokens. Dated snapshot
 * ids (for example `gpt-4o-2024-08-06`) resolve to their base model by
 * longest-prefix match; unknown models fall back to zero cost.
 */
const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { promptCostPer1k: 0.0025, completionCostPer1k: 0.01 },
  'gpt-4o-mini': { promptCostPer1k: 0.00015, completionCostPer1k: 0.0006 },
  'gpt-4.1': { promptCostPer1k: 0.002, completionCostPer1k: 0.008 },
  'gpt-4.1-mini': { promptCostPer1k: 0.0004, completionCostPer1k: 0.0016 },
  'gpt-4-turbo': { promptCostPer1k: 0.01, completionCostPer1k: 0.03 },
  'gpt-4': { promptCostPer1k: 0.03, completionCostPer1k: 0.06 },
  'gpt-3.5-turbo': { promptCostPer1k: 0.0005, completionCostPer1k: 0.0015 },
};

/**
 * LLM provider backed by the official OpenAI SDK.
 *
 * Translates the toolkit's unified {@link CompletionRequest} and
 * {@link CompletionResponse} shapes to and from OpenAI's chat completions API,
 * applies retries and optional rate limiting, and maps SDK failures onto the
 * toolkit's {@link AiError} hierarchy.
 */
export class OpenAiProvider extends BaseProvider {
  private readonly client: OpenAI;

  /**
   * @param options The resolved module options (API key, default model, timeout,
   * retries and optional rate limiting).
   * @param client An optional preconfigured OpenAI client. When omitted, one is
   * created from `options`. Supplying your own client enables custom setups
   * (Azure, a proxy `baseURL`, a custom `fetch`) and makes the provider simple
   * to test without network access.
   */
  constructor(options: AiModuleOptions, client?: OpenAI) {
    super(options);
    this.client =
      client ??
      new OpenAI({
        apiKey: options.apiKey,
        timeout: options.timeout,
        // Retries are handled by the toolkit's own withRetry wrapper, so the
        // SDK's built-in retrying is disabled to avoid compounding attempts.
        maxRetries: 0,
      });
  }

  /**
   * Generate a single chat completion and translate the result into the unified
   * {@link CompletionResponse}, including token usage and an estimated cost.
   *
   * @param request The unified completion request.
   * @returns The completion content together with usage and cost details.
   * @throws {AiError} A translated, library-specific error on failure.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = this.resolveModel(request);
    try {
      const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
        ...this.buildParams(request, model),
        stream: false,
      };
      const response = await this.run(() =>
        this.client.chat.completions.create(params),
      );
      return this.toCompletionResponse(response, model);
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /**
   * Generate a chat completion as a stream of incremental content chunks.
   *
   * @param request The unified completion request.
   * @returns An async iterable yielding {@link CompletionChunk}s as content
   * arrives. The iterable completes cleanly once the model finishes.
   * @throws {AiError} A translated, library-specific error on failure.
   */
  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const model = this.resolveModel(request);
    try {
      const params: OpenAI.ChatCompletionCreateParamsStreaming = {
        ...this.buildParams(request, model),
        stream: true,
      };
      const openAiStream = await this.run(() =>
        this.client.chat.completions.create(params),
      );
      for await (const part of openAiStream) {
        const content = part.choices[0]?.delta?.content;
        if (content) {
          yield { content };
        }
      }
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /** Build the OpenAI request parameters shared by both completion modes. */
  private buildParams(
    request: CompletionRequest,
    model: string,
  ): {
    model: string;
    messages: OpenAI.ChatCompletionMessageParam[];
    temperature?: number;
    max_completion_tokens?: number;
  } {
    return {
      model,
      messages: this.toMessages(request.messages),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.maxTokens !== undefined
        ? { max_completion_tokens: request.maxTokens }
        : {}),
    };
  }

  /** Map unified messages onto OpenAI's role-specific message params. */
  private toMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((message): OpenAI.ChatCompletionMessageParam => {
      switch (message.role) {
        case 'system':
          return { role: 'system', content: message.content };
        case 'assistant':
          return { role: 'assistant', content: message.content };
        case 'user':
          return { role: 'user', content: message.content };
      }
    });
  }

  /** Translate an OpenAI chat completion into the unified response shape. */
  private toCompletionResponse(
    response: OpenAI.ChatCompletion,
    model: string,
  ): CompletionResponse {
    const content = response.choices[0]?.message.content ?? '';
    const usage = response.usage;
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
    const estimatedCostUsd = calculateCostUsd(
      { promptTokens, completionTokens },
      resolveModelPricing(OPENAI_PRICING, model),
    );

    return {
      content,
      usage: { promptTokens, completionTokens, totalTokens, estimatedCostUsd },
    };
  }

  /** Decide whether an OpenAI SDK error is worth retrying. */
  protected isRetryable(error: unknown): boolean {
    if (
      error instanceof AuthenticationError ||
      error instanceof PermissionDeniedError ||
      error instanceof BadRequestError ||
      error instanceof NotFoundError
    ) {
      return false;
    }
    if (error instanceof RateLimitError) {
      return true;
    }
    // APIConnectionError (and its timeout subclass) carry no HTTP status.
    if (error instanceof APIConnectionError) {
      return true;
    }
    if (error instanceof APIError) {
      return error.status === undefined || error.status >= 500;
    }
    return false;
  }

  /** Map an OpenAI SDK error onto the toolkit's {@link AiError} hierarchy. */
  private translateError(error: unknown): AiError {
    if (error instanceof AiError) {
      return error;
    }
    if (error instanceof AuthenticationError) {
      return new AiAuthenticationError(
        'OpenAI authentication failed. Check that your API key is correct.',
        { provider: PROVIDER_NAME, cause: error, status: error.status },
      );
    }
    if (error instanceof RateLimitError) {
      return new AiRateLimitError(
        'OpenAI rate limit exceeded. Reduce your request rate or try again later.',
        { provider: PROVIDER_NAME, cause: error, status: error.status },
      );
    }
    if (error instanceof APIConnectionTimeoutError) {
      return new AiTimeoutError('The OpenAI request timed out.', {
        provider: PROVIDER_NAME,
        cause: error,
      });
    }
    if (error instanceof BadRequestError) {
      return new AiInvalidRequestError(error.message, {
        provider: PROVIDER_NAME,
        cause: error,
        status: error.status,
      });
    }
    if (error instanceof APIConnectionError) {
      return new AiConnectionError('Failed to connect to OpenAI.', {
        provider: PROVIDER_NAME,
        cause: error,
      });
    }
    if (error instanceof APIError) {
      return new AiProviderError(`OpenAI API error: ${error.message}`, {
        provider: PROVIDER_NAME,
        cause: error,
        // `instanceof` on the generic APIError widens `status` to `any`.
        status: typeof error.status === 'number' ? error.status : undefined,
      });
    }
    return new AiError(
      error instanceof Error ? error.message : 'Unknown OpenAI provider error.',
      { provider: PROVIDER_NAME, cause: error },
    );
  }
}
