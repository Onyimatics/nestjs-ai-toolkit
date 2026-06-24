import { Test, TestingModule } from '@nestjs/testing';
import { AiModule } from '../src/ai.module';
import { AiService } from '../src/ai.service';

describe('AiModule', () => {
  // Instantiating a provider creates its SDK client but makes no network call,
  // so configuring forRoot is safe in tests without a real key.
  it.each(['openai', 'anthropic'] as const)(
    'provides AiService when configured with the %s provider',
    async (provider) => {
      const defaultModel =
        provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-6';
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          AiModule.forRoot({ provider, apiKey: 'test-key', defaultModel }),
        ],
      }).compile();

      const service = moduleRef.get<AiService>(AiService);
      expect(service).toBeInstanceOf(AiService);

      await moduleRef.close();
    },
  );

  it('throws a validation error for invalid options', () => {
    expect(() =>
      AiModule.forRoot({
        provider: 'openai',
        apiKey: '',
        defaultModel: 'gpt-4o',
      }),
    ).toThrow();
  });
});
