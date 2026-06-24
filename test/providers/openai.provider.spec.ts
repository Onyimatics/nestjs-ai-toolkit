import OpenAI, { APIConnectionTimeoutError, APIError } from 'openai';
import {
  AiAuthenticationError,
  AiProviderError,
  AiTimeoutError,
} from '../../src/core/errors';
import { AiModuleOptions } from '../../src/interfaces/ai-options.interface';
import { CompletionChunk } from '../../src/interfaces/completion.interface';
import { OpenAiProvider } from '../../src/providers/openai.provider';

/**
 * Build a fake OpenAI client whose only behaviour is the mocked
 * `chat.completions.create`. No network is ever touched.
 */
function buildClient(create: jest.Mock): OpenAI {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

function buildProvider(
  create: jest.Mock,
  options: Partial<AiModuleOptions> = {},
): OpenAiProvider {
  const resolved: AiModuleOptions = {
    provider: 'openai',
    apiKey: 'test-key',
    defaultModel: 'gpt-4o',
    ...options,
  };
  return new OpenAiProvider(resolved, buildClient(create));
}

/** A minimal OpenAI chat completion response shaped like the real SDK type. */
function chatCompletion(content: string): unknown {
  return {
    id: 'chatcmpl-test',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1000, completion_tokens: 2000, total_tokens: 3000 },
  };
}

/** An async iterable of streaming chunks shaped like the real SDK type. */
async function* chunkStream(
  contents: Array<string | null>,
): AsyncGenerator<unknown> {
  for (const content of contents) {
    yield { choices: [{ index: 0, delta: { content }, finish_reason: null }] };
  }
}

describe('OpenAiProvider', () => {
  describe('complete', () => {
    it('translates the request and returns a populated response with cost', async () => {
      const create = jest
        .fn()
        .mockResolvedValue(chatCompletion('Hello there!'));
      const provider = buildProvider(create);

      const response = await provider.complete({
        messages: [
          { role: 'system', content: 'Be nice.' },
          { role: 'user', content: 'Hi' },
        ],
        temperature: 0.5,
        maxTokens: 256,
      });

      // Request was translated into the OpenAI shape.
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0]).toMatchObject({
        model: 'gpt-4o',
        stream: false,
        temperature: 0.5,
        max_completion_tokens: 256,
        messages: [
          { role: 'system', content: 'Be nice.' },
          { role: 'user', content: 'Hi' },
        ],
      });

      // Response translated, including cost for gpt-4o
      // (1k in * $0.0025) + (2k out * $0.01) = 0.0025 + 0.02 = 0.0225
      expect(response.content).toBe('Hello there!');
      expect(response.usage).toEqual({
        promptTokens: 1000,
        completionTokens: 2000,
        totalTokens: 3000,
        estimatedCostUsd: 0.0225,
      });
    });

    it('falls back to the default model when the request omits one', async () => {
      const create = jest.fn().mockResolvedValue(chatCompletion('ok'));
      const provider = buildProvider(create, { defaultModel: 'gpt-4o-mini' });

      await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(create.mock.calls[0][0].model).toBe('gpt-4o-mini');
    });

    it('omits temperature and max tokens when they are not provided', async () => {
      const create = jest.fn().mockResolvedValue(chatCompletion('ok'));
      const provider = buildProvider(create);

      await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      const params = create.mock.calls[0][0];
      expect(params).not.toHaveProperty('temperature');
      expect(params).not.toHaveProperty('max_completion_tokens');
    });
  });

  describe('stream', () => {
    it('yields a chunk per content delta and skips empty deltas', async () => {
      const create = jest
        .fn()
        .mockResolvedValue(chunkStream(['Hel', 'lo', null, '!']));
      const provider = buildProvider(create);

      const received: CompletionChunk[] = [];
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        received.push(chunk);
      }

      expect(create.mock.calls[0][0].stream).toBe(true);
      expect(received).toEqual([
        { content: 'Hel' },
        { content: 'lo' },
        { content: '!' },
      ]);
    });
  });

  describe('error handling', () => {
    it('maps authentication errors and does not retry them', async () => {
      const create = jest
        .fn()
        .mockRejectedValue(
          APIError.generate(401, undefined, 'bad key', new Headers()),
        );
      const provider = buildProvider(create, { maxRetries: 5 });

      await expect(
        provider.complete({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toBeInstanceOf(AiAuthenticationError);
      // Auth errors are non-transient, so only a single attempt is made.
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('maps timeout errors', async () => {
      const create = jest
        .fn()
        .mockRejectedValue(
          new APIConnectionTimeoutError({ message: 'timed out' }),
        );
      const provider = buildProvider(create, { maxRetries: 0 });

      await expect(
        provider.complete({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toBeInstanceOf(AiTimeoutError);
    });

    it('retries transient rate-limit errors and then succeeds', async () => {
      const create = jest
        .fn()
        .mockRejectedValueOnce(
          APIError.generate(429, undefined, 'slow down', new Headers()),
        )
        .mockResolvedValue(chatCompletion('recovered'));
      const provider = buildProvider(create, { maxRetries: 2 });

      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(create).toHaveBeenCalledTimes(2);
      expect(response.content).toBe('recovered');
    });

    it('retries transient 5xx errors and gives up after maxRetries', async () => {
      const create = jest
        .fn()
        .mockRejectedValue(
          APIError.generate(500, undefined, 'boom', new Headers()),
        );
      const provider = buildProvider(create, { maxRetries: 2 });

      await expect(
        provider.complete({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toBeInstanceOf(AiProviderError);
      // 1 initial attempt + 2 retries.
      expect(create).toHaveBeenCalledTimes(3);
    });
  });
});
