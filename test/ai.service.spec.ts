import { AiService } from '../src/ai.service';
import {
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
} from '../src/interfaces/completion.interface';
import { AiProvider } from '../src/interfaces/provider.interface';

function fakeResponse(content: string): CompletionResponse {
  return {
    content,
    usage: {
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      estimatedCostUsd: 0,
    },
  };
}

describe('AiService', () => {
  it('delegates complete() to the configured provider', async () => {
    const provider: AiProvider = {
      complete: jest.fn().mockResolvedValue(fakeResponse('hi')),
      stream: jest.fn(),
    };
    const service = new AiService(provider);
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Hi' }],
    };

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
    const service = new AiService(provider);
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const stream = await service.stream(request);
    const chunks: CompletionChunk[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(provider.stream).toHaveBeenCalledWith(request);
    expect(chunks).toEqual([{ content: 'a' }, { content: 'b' }]);
  });
});
