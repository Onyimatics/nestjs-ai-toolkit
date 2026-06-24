import { AiService } from '../src/ai.service';
import { AiModuleOptions } from '../src/interfaces/ai-options.interface';
import {
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
} from '../src/interfaces/completion.interface';
import { AiProvider } from '../src/interfaces/provider.interface';

function makeOptions(
  overrides: Partial<AiModuleOptions> = {},
): AiModuleOptions {
  return {
    provider: 'openai',
    apiKey: 'test-key',
    defaultModel: 'gpt-4o',
    ...overrides,
  };
}

function fakeResponse(
  content: string,
  estimatedCostUsd: number | null = 0,
): CompletionResponse {
  return {
    content,
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      estimatedCostUsd,
    },
  };
}

const request: CompletionRequest = {
  messages: [{ role: 'user', content: 'Hi' }],
};

describe('AiService', () => {
  it('delegates complete() to the configured provider', async () => {
    const provider: AiProvider = {
      complete: jest.fn().mockResolvedValue(fakeResponse('hi')),
      stream: jest.fn(),
    };
    const service = new AiService(provider, makeOptions());

    const result = await service.complete(request);

    expect(provider.complete).toHaveBeenCalledWith(request);
    expect(result.content).toBe('hi');
  });

  it('delegates stream() to the provider and exposes the async iterable', async () => {
    async function* gen(): AsyncGenerator<CompletionChunk> {
      yield { content: 'a' };
      yield { content: 'b' };
    }
    const provider: AiProvider = {
      complete: jest.fn(),
      stream: jest.fn().mockReturnValue(gen()),
    };
    const service = new AiService(provider, makeOptions());

    const stream = await service.stream(request);
    const chunks: CompletionChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(provider.stream).toHaveBeenCalledWith(request);
    expect(chunks).toEqual([{ content: 'a' }, { content: 'b' }]);
  });

  it('does not track usage unless trackUsage is enabled', async () => {
    const provider: AiProvider = {
      complete: jest.fn().mockResolvedValue(fakeResponse('hi')),
      stream: jest.fn(),
    };
    const service = new AiService(provider, makeOptions());

    await service.complete(request);

    expect(service.getUsageTotals()).toBeUndefined();
  });

  it('accumulates usage totals across requests when trackUsage is enabled', async () => {
    const provider: AiProvider = {
      complete: jest.fn().mockResolvedValue(fakeResponse('hi', 0.01)),
      stream: jest.fn(),
    };
    const service = new AiService(provider, makeOptions({ trackUsage: true }));

    await service.complete(request);
    await service.complete(request);

    expect(service.getUsageTotals()).toEqual({
      totalPromptTokens: 20,
      totalCompletionTokens: 40,
      totalTokens: 60,
      totalEstimatedCostUsd: 0.02,
      requestCount: 2,
      requestsWithUnknownCost: 0,
    });

    service.resetUsage();
    expect(service.getUsageTotals()?.requestCount).toBe(0);
  });
});
