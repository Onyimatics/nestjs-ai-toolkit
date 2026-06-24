import { Inject, Injectable } from '@nestjs/common';
import { AI_MODULE_OPTIONS, AI_PROVIDER } from './constants';
import { UsageTracker, UsageTotals } from './core/usage-tracker';
import type { AiModuleOptions } from './interfaces/ai-options.interface';
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
 *
 * When `trackUsage` is enabled in the module options, completed `complete()`
 * requests accumulate into per-instance usage totals readable with
 * {@link getUsageTotals}.
 */
@Injectable()
export class AiService {
  /** Per-instance usage tracker, present only when `trackUsage` is enabled. */
  private readonly usageTracker?: UsageTracker;

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    @Inject(AI_MODULE_OPTIONS) options: AiModuleOptions,
  ) {
    if (options.trackUsage) {
      this.usageTracker = new UsageTracker();
    }
  }

  /**
   * Generate a single chat completion.
   *
   * @param request The messages and generation options for the completion.
   * @returns A promise resolving to the completion content and usage details.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.provider.complete(request);
    this.usageTracker?.record(response.usage);
    return response;
  }

  /**
   * Generate a chat completion as a stream of incremental content chunks.
   *
   * @param request The messages and generation options for the completion.
   * @returns A promise resolving to an async iterable of {@link CompletionChunk}s.
   */
  stream(request: CompletionRequest): Promise<AsyncIterable<CompletionChunk>> {
    // Defer to a microtask so that a synchronous throw from the provider
    // surfaces as a rejected promise rather than a synchronous exception at the
    // call site.
    return Promise.resolve().then(() => this.provider.stream(request));
  }

  /**
   * Read a snapshot of accumulated usage totals.
   *
   * @returns The running totals, or `undefined` when usage tracking was not
   * enabled via the `trackUsage` module option.
   */
  getUsageTotals(): UsageTotals | undefined {
    return this.usageTracker?.getTotals();
  }

  /** Reset accumulated usage totals. A no-op when tracking is disabled. */
  resetUsage(): void {
    this.usageTracker?.reset();
  }
}
