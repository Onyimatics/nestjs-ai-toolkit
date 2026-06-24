import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER } from './constants';
import {
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
} from './interfaces/completion.interface';
import type { AiProvider } from './interfaces/provider.interface';

/**
 * The primary entry point for performing LLM operations.
 *
 * `AiService` exposes a small, provider-agnostic API and delegates the actual
 * work to the configured {@link AiProvider}. Inject it anywhere in your NestJS
 * application after registering {@link AiModule}.
 */
@Injectable()
export class AiService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  /**
   * Generate a single chat completion.
   *
   * @param request The messages and generation options for the completion.
   * @returns A promise resolving to the completion content and usage details.
   */
  complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.provider.complete(request);
  }

  /**
   * Generate a chat completion as a stream of incremental content chunks.
   *
   * @param request The messages and generation options for the completion.
   * @returns A promise resolving to an async iterable of {@link CompletionChunk}s.
   */
  stream(request: CompletionRequest): Promise<AsyncIterable<CompletionChunk>> {
    // Defer to a microtask so that a synchronous throw from the provider (for
    // example the placeholder's NotImplemented error) surfaces as a rejected
    // promise rather than a synchronous exception at the call site.
    return Promise.resolve().then(() => this.provider.stream(request));
  }
}
