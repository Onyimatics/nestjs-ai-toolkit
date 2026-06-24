import {
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
} from './completion.interface';

/**
 * The contract that every LLM provider implementation must fulfil.
 *
 * A provider translates the toolkit's unified request and response shapes to and
 * from a specific vendor SDK (for example OpenAI or Anthropic). Cross-cutting
 * behaviour such as retries, rate limiting and cost tracking is layered on top
 * of this interface by the core, so providers should focus purely on the vendor
 * interaction.
 */
export interface AiProvider {
  /**
   * Produce a single, complete chat completion.
   *
   * @param request The completion request to fulfil.
   * @returns A promise that resolves to the full completion response.
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Produce a chat completion as a stream of incremental content chunks.
   *
   * @param request The completion request to fulfil.
   * @returns An async iterable that yields {@link CompletionChunk}s as they are
   * generated.
   */
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>;
}
