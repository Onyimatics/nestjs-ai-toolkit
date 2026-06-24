import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
} from '@anthropic-ai/sdk';
import {
  AiAuthenticationError,
  AiProviderError,
  AiTimeoutError,
} from '../../src/core/errors';
import { AiModuleOptions } from '../../src/interfaces/ai-options.interface';
import { CompletionChunk } from '../../src/interfaces/completion.interface';
import { AnthropicProvider } from '../../src/providers/anthropic.provider';

/**
 * Build a fake Anthropic client whose only behaviour is the mocked
 * `messages.create`. No network is ever touched.
 */
function buildClient(create: jest.Mock): Anthropic {
  return { messages: { create } } as unknown as Anthropic;
}

function buildProvider(
  create: jest.Mock,
  options: Partial<AiModuleOptions> = {},
): AnthropicProvider {
  const resolved: AiModuleOptions = {
    provider: 'anthropic',
    apiKey: 'test-key',
    defaultModel: 'claude-sonnet-4',
    ...options,
  };
  return new AnthropicProvider(resolved, buildClient(create));
}

/** A minimal Anthropic message response shaped like the real SDK type. */
function anthropicMessage(text: string): unknown {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1000, output_tokens: 2000 },
  };
}

/** An async iterable of Anthropic streaming events shaped like the SDK type. */
async function* anthropicStream(texts: string[]): AsyncGenerator<unknown> {
  yield { type: 'message_start', message: { id: 'msg_test' } };
  // A non-text delta that must be ignored by the provider.
  yield {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: '{}' },
  };
  for (const text of texts) {
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    };
  }
  yield { type: 'message_stop' };
}

describe('AnthropicProvider', () => {
  describe('complete', () => {
    it('translates the request and returns a populated response with cost', async () => {
      const create = jest
        .fn()
        .mockResolvedValue(anthropicMessage('Hello there!'));
      const provider = buildProvider(create);

      const response = await provider.complete({
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.5,
        maxTokens: 256,
      });

      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0]).toMatchObject({
        model: 'claude-sonnet-4',
        max_tokens: 256,
        stream: false,
        temperature: 0.5,
        messages: [{ role: 'user', content: 'Hi' }],
      });

      // Cost for claude-sonnet-4: (1k in * $0.003) + (2k out * $0.015)
      // = 0.003 + 0.03 = 0.033
      expect(response.content).toBe('Hello there!');
      expect(response.usage).toEqual({
        promptTokens: 1000,
        completionTokens: 2000,
        totalTokens: 3000,
        estimatedCostUsd: 0.033,
      });
    });

    it('passes the system message as a top-level parameter, not in messages', async () => {
      const create = jest.fn().mockResolvedValue(anthropicMessage('ok'));
      const provider = buildProvider(create);

      await provider.complete({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
          { role: 'user', content: 'How are you?' },
        ],
      });

      const params = create.mock.calls[0][0];
      expect(params.system).toBe('You are helpful.');
      expect(params.messages).toEqual([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'How are you?' },
      ]);
      // No system role leaks into the messages array.
      expect(
        (params.messages as Array<{ role: string }>).some(
          (m) => m.role === 'system',
        ),
      ).toBe(false);
    });

    it('joins multiple system messages into one system prompt', async () => {
      const create = jest.fn().mockResolvedValue(anthropicMessage('ok'));
      const provider = buildProvider(create);

      await provider.complete({
        messages: [
          { role: 'system', content: 'Rule one.' },
          { role: 'system', content: 'Rule two.' },
          { role: 'user', content: 'Hi' },
        ],
      });

      expect(create.mock.calls[0][0].system).toBe('Rule one.\n\nRule two.');
    });

    it('applies a default max_tokens when the request omits one', async () => {
      const create = jest.fn().mockResolvedValue(anthropicMessage('ok'));
      const provider = buildProvider(create);

      await provider.complete({ messages: [{ role: 'user', content: 'Hi' }] });

      expect(create.mock.calls[0][0].max_tokens).toBe(4096);
    });
  });

  describe('stream', () => {
    it('yields a chunk per text delta and ignores non-text events', async () => {
      const create = jest
        .fn()
        .mockResolvedValue(anthropicStream(['Hel', 'lo']));
      const provider = buildProvider(create);

      const received: CompletionChunk[] = [];
      for await (const chunk of provider.stream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        received.push(chunk);
      }

      expect(create.mock.calls[0][0].stream).toBe(true);
      expect(received).toEqual([{ content: 'Hel' }, { content: 'lo' }]);
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
