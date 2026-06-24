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
 * A placeholder provider for providers that are configured but not yet
 * implemented (currently `anthropic`). Every operation fails with a clear
 * {@link NotImplementedException} so the module still wires up cleanly while
 * making it obvious that the selected provider is unavailable.
 */
export class PlaceholderProvider extends BaseProvider {
  constructor(options: AiModuleOptions) {
    super(options);
  }

  /** Always rejects: the configured provider is not implemented yet. */
  complete(_request: CompletionRequest): Promise<CompletionResponse> {
    return Promise.reject(this.notImplemented());
  }

  /** Always throws: the configured provider is not implemented yet. */
  stream(_request: CompletionRequest): AsyncIterable<CompletionChunk> {
    throw this.notImplemented();
  }

  /** Build the shared "not implemented" error for the configured provider. */
  private notImplemented(): NotImplementedException {
    return new NotImplementedException(
      `The '${this.options.provider}' provider is not implemented yet.`,
    );
  }
}
