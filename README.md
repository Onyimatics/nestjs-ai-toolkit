# NestJS AI Toolkit

> Production-ready LLM integration for NestJS. Add OpenAI, Anthropic, and more to your backend with streaming, retries, rate limiting, and cost tracking built in.

[![npm version](https://img.shields.io/npm/v/nestjs-ai-toolkit.svg)](https://www.npmjs.com/package/nestjs-ai-toolkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![CI](https://github.com/Onyimatics/nestjs-ai-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/Onyimatics/nestjs-ai-toolkit/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

---

## The Problem

NestJS is one of the most popular Node.js frameworks, but it has no official, well-maintained way to integrate large language models into your backend. Every team that wants to add AI ends up writing the same plumbing by hand:

- Wiring up the OpenAI or Anthropic SDK from scratch
- Reinventing retry logic when requests fail
- Building their own rate limiting to avoid hitting quota limits
- Manually tracking token usage and cost
- Handling streaming responses without a clean abstraction
- Switching providers means rewriting everything

This toolkit removes that repeated work. It gives you a clean, type-safe, NestJS-native way to work with language models, so you can focus on your product instead of the plumbing.

---

## Features

- **Unified provider interface.** Use OpenAI and Anthropic through one consistent API. Switch providers without rewriting your code.
- **First-class TypeScript.** Fully typed from configuration to responses. Catch errors at compile time, not in production.
- **Streaming support.** Stream responses token by token with a clean, idiomatic interface.
- **Automatic retries.** Built-in exponential backoff for transient failures, configurable per request.
- **Rate limiting.** Protect your application from quota exhaustion with built-in request throttling.
- **Token counting and cost tracking.** Know exactly how many tokens each request used and what it cost.
- **RAG helpers.** Utilities for retrieval-augmented generation, so connecting your data to an LLM is straightforward.
- **NestJS-native.** A proper dynamic module with dependency injection, just like you would expect.

---

## Installation

```bash
npm install nestjs-ai-toolkit
```

You will also need the SDK for whichever provider you intend to use:

```bash
# For OpenAI
npm install openai

# For Anthropic
npm install @anthropic-ai/sdk
```

---

## Quick Start

Register the module in your application:

```typescript
import { Module } from '@nestjs/common';
import { AiModule } from 'nestjs-ai-toolkit';

@Module({
  imports: [
    AiModule.forRoot({
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      defaultModel: 'gpt-4o',
    }),
  ],
})
export class AppModule {}
```

Inject the service and start using it:

```typescript
import { Injectable } from '@nestjs/common';
import { AiService } from 'nestjs-ai-toolkit';

@Injectable()
export class WellnessService {
  constructor(private readonly ai: AiService) {}

  async getAdvice(prompt: string): Promise<string> {
    const response = await this.ai.complete({
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content;
  }
}
```

---

## Streaming

```typescript
async streamAdvice(prompt: string) {
  const stream = await this.ai.stream({
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.content);
  }
}
```

---

## Switching Providers

Because the interface is unified, moving from OpenAI to Anthropic is a configuration change, not a rewrite:

```typescript
AiModule.forRoot({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultModel: 'claude-sonnet-4',
});
```

Your service code stays exactly the same.

---

## Cost Tracking

Every response includes usage and cost information:

```typescript
const response = await this.ai.complete({
  messages: [{ role: 'user', content: 'Explain RAG in one sentence.' }],
});

console.log(response.usage);
// { promptTokens: 12, completionTokens: 28, totalTokens: 40, estimatedCostUsd: 0.0009 }
```

---

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `'openai' \| 'anthropic'` | Which LLM provider to use |
| `apiKey` | `string` | Your provider API key |
| `defaultModel` | `string` | The model to use when none is specified per request |
| `maxRetries` | `number` | Maximum retry attempts on failure (default: 3) |
| `rateLimit` | `object` | Requests-per-window throttling configuration |
| `timeout` | `number` | Request timeout in milliseconds |

---

## Roadmap

This project is being built in the open, one milestone at a time.

- [x] Project scaffold and core architecture
- [ ] OpenAI provider with completion support
- [ ] Streaming responses
- [ ] Automatic retries with exponential backoff
- [ ] Anthropic provider via the unified interface
- [ ] Token counting and cost tracking
- [ ] Rate limiting
- [ ] RAG helper utilities
- [ ] First stable release (v1.0.0)

Follow the repository to watch it develop.

---

## Contributing

Contributions are welcome. Whether it is a bug report, a feature suggestion, a documentation improvement, or a pull request, all are appreciated.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes with clear messages
4. Open a pull request describing what you changed and why

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting larger changes.

---

## License

MIT. See [LICENSE](./LICENSE) for details.

---

## About

Built and maintained by Onyinye Favour Ezike, a Full Stack and AI engineer focused on developer tools for the AI era.

If you find this useful, a star on the repository helps others discover it.
