import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  CompletionRequest,
  CompletionResponse,
} from '../src/interfaces/completion.interface';
import { AiProvider } from '../src/interfaces/provider.interface';
import { AnthropicProvider } from '../src/providers/anthropic.provider';
import { OpenAiProvider } from '../src/providers/openai.provider';

/**
 * Application-level code that is completely agnostic to which provider it talks
 * to. This is the exact code path that must behave identically for both
 * providers, which is the whole point of the unified interface.
 */
async function askForGreeting(
  provider: AiProvider,
): Promise<CompletionResponse> {
  const request: CompletionRequest = {
    messages: [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Say hi.' },
    ],
    temperature: 0.2,
    maxTokens: 64,
  };
  return provider.complete(request);
}

function makeOpenAiProvider(): AiProvider {
  const create = jest.fn().mockResolvedValue({
    id: 'chatcmpl-test',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: 'unified!' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
  const client = { chat: { completions: { create } } } as unknown as OpenAI;
  return new OpenAiProvider(
    { provider: 'openai', apiKey: 'test-key', defaultModel: 'gpt-4o' },
    client,
  );
}

function makeAnthropicProvider(): AiProvider {
  const create = jest.fn().mockResolvedValue({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4',
    content: [{ type: 'text', text: 'unified!' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 },
  });
  const client = { messages: { create } } as unknown as Anthropic;
  return new AnthropicProvider(
    {
      provider: 'anthropic',
      apiKey: 'test-key',
      defaultModel: 'claude-sonnet-4',
    },
    client,
  );
}

describe('unified provider interface', () => {
  const cases: Array<[string, () => AiProvider]> = [
    ['openai', makeOpenAiProvider],
    ['anthropic', makeAnthropicProvider],
  ];

  it.each(cases)(
    'produces a valid CompletionResponse from the %s provider via identical code',
    async (_name, makeProvider) => {
      const response = await askForGreeting(makeProvider());

      // Same content and shape regardless of provider.
      expect(response.content).toBe('unified!');
      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.usage.totalTokens).toBe(30);
      expect(typeof response.usage.estimatedCostUsd).toBe('number');
    },
  );
});
