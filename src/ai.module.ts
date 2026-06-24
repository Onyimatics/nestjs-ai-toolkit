import { DynamicModule, Module, Provider } from '@nestjs/common';
import { z } from 'zod';
import { AiService } from './ai.service';
import { AI_MODULE_OPTIONS, AI_PROVIDER } from './constants';
import { AiModuleOptions } from './interfaces/ai-options.interface';
import { AiProvider } from './interfaces/provider.interface';
import { PlaceholderProvider } from './providers/base.provider';
import { OpenAiProvider } from './providers/openai.provider';

/**
 * Runtime validation schema for {@link AiModuleOptions}. Validating at module
 * registration fails fast on misconfiguration instead of surfacing obscure
 * errors at request time.
 */
const optionsSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  apiKey: z.string().min(1, 'apiKey is required'),
  defaultModel: z.string().min(1, 'defaultModel is required'),
  maxRetries: z.number().int().nonnegative().optional(),
  rateLimit: z
    .object({
      maxRequests: z.number().int().positive(),
      windowMs: z.number().int().positive(),
    })
    .optional(),
  timeout: z.number().int().positive().optional(),
});

/**
 * The NestJS dynamic module that wires the toolkit into an application.
 *
 * Register it once at the root of your application with {@link forRoot},
 * passing your provider, API key and default model. The module exposes
 * {@link AiService} for injection across your codebase.
 */
@Module({})
export class AiModule {
  /**
   * Configure and register the AI toolkit.
   *
   * @param options Provider selection, credentials and tuning options.
   * @returns A configured {@link DynamicModule} exporting {@link AiService}.
   * @throws A validation error when `options` are malformed.
   */
  static forRoot(options: AiModuleOptions): DynamicModule {
    // Throws if the supplied configuration is invalid.
    optionsSchema.parse(options);

    const optionsProvider: Provider = {
      provide: AI_MODULE_OPTIONS,
      useValue: options,
    };

    const providerProvider: Provider = {
      provide: AI_PROVIDER,
      useFactory: (opts: AiModuleOptions): AiProvider =>
        AiModule.createProvider(opts),
      inject: [AI_MODULE_OPTIONS],
    };

    return {
      module: AiModule,
      providers: [optionsProvider, providerProvider, AiService],
      exports: [AiService],
    };
  }

  /**
   * Instantiate the provider implementation for the configured options.
   *
   * The OpenAI provider is fully implemented. Providers that are not yet
   * available fall back to a {@link PlaceholderProvider} whose operations reject
   * with a clear "not implemented" error, so the module still wires up cleanly.
   */
  private static createProvider(options: AiModuleOptions): AiProvider {
    switch (options.provider) {
      case 'openai':
        return new OpenAiProvider(options);
      case 'anthropic':
        return new PlaceholderProvider(options);
      default:
        throw new Error(`Unsupported AI provider: ${String(options.provider)}`);
    }
  }
}
