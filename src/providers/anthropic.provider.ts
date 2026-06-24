import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
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
const PROVIDER_NAME = 'anthropic';

/**
 * Anthropic requires an explicit `max_tokens` on every request, unlike OpenAI
 * where it is optional. When the unified request omits `maxTokens`, this default
 * is applied. It only caps the response length; billing is for tokens actually
 * generated, so a generous default does not inflate cost for short replies.
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Known Anthropic model pricing, in US dollars per 1,000 tokens. Dated snapshot
 * ids (for example `claude-3-5-sonnet-20241022`) resolve to their base model by
 * longest-prefix match; unknown models fall back to zero cost.
 */
const ANTHROPIC_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4': { promptCostPer1k: 0.015, completionCostPer1k: 0.075 },
  'claude-sonnet-4': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  'claude-3-5-sonnet': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  'claude-3-5-haiku': { promptCostPer1k: 0.0008, completionCostPer1k: 0.004 },
  'claude-3-opus': { promptCostPer1k: 0.015, completionCostPer1k: 0.075 },
  'claude-3-sonnet': { promptCostPer1k: 0.003, completionCostPer1k: 0.015 },
  'claude-3-haiku': { promptCostPer1k: 0.00025, completionCostPer1k: 0.00125 },
};

/**
 * LLM provider backed by the official Anthropic SDK.
 *
 * Implements the same {@link BaseProvider}/`AiProvider` contract as the OpenAI
 * provider, so application code is identical regardless of which provider is
 * configured. The notable difference Anthropic imposes is that the system
 * prompt is a separate top-level `system` parameter rather than a message, so
 * `system` messages are extracted from the unified request and passed there.
 */
export class AnthropicProvider extends BaseProvider {
  private readonly client: Anthropic;

  /**
   * @param options The resolved module options (API key, default model, timeout,
   * retries and optional rate limiting).
   * @param client An optional preconfigured Anthropic client. When omitted, one
   * is created from `options`. Supplying your own client enables custom setups
   * (a proxy `baseURL`, a custom `fetch`) and makes the provider simple to test
   * without network access.
   */
  constructor(options: AiModuleOptions, client?: Anthropic) {
    super(options);
    this.client =
      client ??
      new Anthropic({
        apiKey: options.apiKey,
        timeout: options.timeout,
        // Retries are handled by the toolkit's own withRetry wrapper, so the
        // SDK's built-in retrying is disabled to avoid compounding attempts.
        maxRetries: 0,
      });
  }

  /**
   * Generate a single message completion and translate the result into the
   * unified {@link CompletionResponse}, including token usage and estimated cost.
   *
   * @param request The unified completion request.
   * @returns The completion content together with usage and cost details.
   * @throws {AiError} A translated, library-specific error on failure.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = this.resolveModel(request);
    try {
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        ...this.buildParams(request, model),
        stream: false,
      };
      const response = await this.run(() =>
        this.client.messages.create(params),
      );
      return this.toCompletionResponse(response, model);
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /**
   * Generate a message completion as a stream of incremental content chunks in
   * the same {@link CompletionChunk} shape as the OpenAI provider.
   *
   * @param request The unified completion request.
   * @returns An async iterable yielding {@link CompletionChunk}s as content
   * arrives. The iterable completes cleanly once the model finishes.
   * @throws {AiError} A translated, library-specific error on failure.
   */
  async *stream(request: CompletionRequest): AsyncIterable<CompletionChunk> {
    const model = this.resolveModel(request);
    try {
      const params: Anthropic.MessageCreateParamsStreaming = {
        ...this.buildParams(request, model),
        stream: true,
      };
      const anthropicStream = await this.run(() =>
        this.client.messages.create(params),
      );
      for await (const event of anthropicStream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { content: event.delta.text };
        }
      }
    } catch (error) {
      throw this.translateError(error);
    }
  }

  /**
   * Build the Anthropic request parameters shared by both completion modes,
   * extracting the system prompt into the top-level `system` field.
   */
  private buildParams(
    request: CompletionRequest,
    model: string,
  ): {
    model: string;
    max_tokens: number;
    messages: Anthropic.MessageParam[];
    system?: string;
    temperature?: number;
  } {
    const system = this.extractSystemPrompt(request.messages);
    return {
      model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: this.toMessages(request.messages),
      ...(system !== undefined ? { system } : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    };
  }

  /**
   * Join all `system` role messages into Anthropic's single top-level system
   * prompt, or return `undefined` when there are none.
   */
  private extractSystemPrompt(messages: Message[]): string | undefined {
    const systemParts = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content);
    return systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
  }

  /**
   * Map the non-system unified messages onto Anthropic's user/assistant message
   * params. System messages are handled separately via
   * {@link extractSystemPrompt}.
   */
  private toMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];
    for (const message of messages) {
      if (message.role === 'system') {
        continue;
      }
      result.push({ role: message.role, content: message.content });
    }
    return result;
  }

  /** Translate an Anthropic message into the unified response shape. */
  private toCompletionResponse(
    response: Anthropic.Message,
    model: string,
  ): CompletionResponse {
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const promptTokens = response.usage.input_tokens;
    const completionTokens = response.usage.output_tokens;
    const totalTokens = promptTokens + completionTokens;
    const estimatedCostUsd = calculateCostUsd(
      { promptTokens, completionTokens },
      resolveModelPricing(ANTHROPIC_PRICING, model),
    );

    return {
      content,
      usage: { promptTokens, completionTokens, totalTokens, estimatedCostUsd },
    };
  }

  /** Decide whether an Anthropic SDK error is worth retrying. */
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

  /** Map an Anthropic SDK error onto the toolkit's {@link AiError} hierarchy. */
  private translateError(error: unknown): AiError {
    if (error instanceof AiError) {
      return error;
    }
    if (error instanceof AuthenticationError) {
      return new AiAuthenticationError(
        'Anthropic authentication failed. Check that your API key is correct.',
        { provider: PROVIDER_NAME, cause: error, status: error.status },
      );
    }
    if (error instanceof RateLimitError) {
      return new AiRateLimitError(
        'Anthropic rate limit exceeded. Reduce your request rate or try again later.',
        { provider: PROVIDER_NAME, cause: error, status: error.status },
      );
    }
    if (error instanceof APIConnectionTimeoutError) {
      return new AiTimeoutError('The Anthropic request timed out.', {
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
      return new AiConnectionError('Failed to connect to Anthropic.', {
        provider: PROVIDER_NAME,
        cause: error,
      });
    }
    if (error instanceof APIError) {
      return new AiProviderError(`Anthropic API error: ${error.message}`, {
        provider: PROVIDER_NAME,
        cause: error,
        // `instanceof` on the generic APIError widens `status` to `any`.
        status: typeof error.status === 'number' ? error.status : undefined,
      });
    }
    return new AiError(
      error instanceof Error
        ? error.message
        : 'Unknown Anthropic provider error.',
      { provider: PROVIDER_NAME, cause: error },
    );
  }
}
