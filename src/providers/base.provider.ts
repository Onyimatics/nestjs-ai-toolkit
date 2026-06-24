import { NotImplementedException } from '@nestjs/common';
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
 * {@link complete} and {@link stream}. The base captures the resolved module
 * options and offers small helpers that every provider needs, keeping
 * vendor-specific code confined to the subclasses.
 */
export abstract class BaseProvider implements AiProvider {
  protected constructor(protected readonly options: AiModuleOptions) {}

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
}

/**
 * A placeholder provider used until concrete implementations land in
 * Milestone 2. Every operation throws {@link NotImplementedException} so the
 * module wires up cleanly while making it obvious that no real provider has been
 * configured yet.
 */
export class PlaceholderProvider extends BaseProvider {
  constructor(options: AiModuleOptions) {
    super(options);
  }

  /** Always rejects: provider implementations arrive in Milestone 2. */
  complete(_request: CompletionRequest): Promise<CompletionResponse> {
    return Promise.reject(
      new NotImplementedException(
        'AI provider implementations arrive in Milestone 2. No provider is configured yet.',
      ),
    );
  }

  /** Always throws: provider implementations arrive in Milestone 2. */
  stream(_request: CompletionRequest): AsyncIterable<CompletionChunk> {
    throw new NotImplementedException(
      'AI provider implementations arrive in Milestone 2. No provider is configured yet.',
    );
  }
}
