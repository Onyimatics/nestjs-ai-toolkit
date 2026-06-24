import { Test, TestingModule } from '@nestjs/testing';
import { AiModule } from '../src/ai.module';
import { AiService } from '../src/ai.service';

describe('AiModule', () => {
  it('provides AiService backed by the OpenAI provider via forRoot', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          provider: 'openai',
          apiKey: 'test-key',
          defaultModel: 'gpt-4o',
        }),
      ],
    }).compile();

    // Instantiating the OpenAI provider creates an SDK client but makes no
    // network call, so this is safe without a real key.
    const service = moduleRef.get<AiService>(AiService);
    expect(service).toBeInstanceOf(AiService);

    await moduleRef.close();
  });

  it('rejects with a clear error for a provider that is not implemented yet', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AiModule.forRoot({
          provider: 'anthropic',
          apiKey: 'test-key',
          defaultModel: 'claude-sonnet-4',
        }),
      ],
    }).compile();

    const service = moduleRef.get(AiService);

    await expect(
      service.complete({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/not implemented yet/i);

    await moduleRef.close();
  });

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
