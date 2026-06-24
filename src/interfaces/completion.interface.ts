import { Message } from './message.interface';

/**
 * A request for a chat completion. The same shape is used for both buffered
 * ({@link AiProvider.complete}) and streamed ({@link AiProvider.stream})
 * generation.
 */
export interface CompletionRequest {
  /** The ordered conversation history to send to the model. */
  messages: Message[];

  /**
   * The model to use for this request. When omitted, the provider falls back to
   * the `defaultModel` configured on the module.
   */
  model?: string;

  /**
   * Sampling temperature. Higher values produce more varied output, lower
   * values make it more deterministic. Provider-specific bounds apply.
   */
  temperature?: number;

  /** The maximum number of tokens to generate in the completion. */
  maxTokens?: number;
}

/**
 * Token usage and cost accounting for a completed request.
 */
export interface CompletionUsage {
  /** Number of tokens consumed by the prompt (input). */
  promptTokens: number;

  /** Number of tokens produced in the completion (output). */
  completionTokens: number;

  /** Total tokens billed for the request (`promptTokens + completionTokens`). */
  totalTokens: number;

  /** Estimated cost of the request in US dollars. */
  estimatedCostUsd: number;
}

/**
 * The result of a buffered (non-streaming) chat completion.
 */
export interface CompletionResponse {
  /** The generated assistant message content. */
  content: string;

  /** Token usage and estimated cost for the request. */
  usage: CompletionUsage;
}

/**
 * A single chunk emitted while streaming a completion.
 */
export interface CompletionChunk {
  /** The incremental piece of generated content carried by this chunk. */
  content: string;
}
