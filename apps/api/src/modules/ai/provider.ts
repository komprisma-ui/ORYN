export type AiProviderName = 'rules' | 'openai-compatible';

export type AiProviderRequest = {
  agent: string;
  input: string;
  context?: Record<string, unknown>;
};

export type AiProviderResponse = {
  output: string;
  confidence: number;
  actions: string[];
};

export interface AiProvider {
  readonly name: AiProviderName;
  run(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export class RulesAiProvider implements AiProvider {
  readonly name = 'rules' as const;

  async run(request: AiProviderRequest): Promise<AiProviderResponse> {
    return {
      output: `Provider rules aktif untuk agent ${request.agent}.`,
      confidence: 0.7,
      actions: [],
    };
  }
}

export function getConfiguredAiProvider(): AiProvider {
  // External providers are intentionally opt-in. ORYN remains fully functional offline.
  return new RulesAiProvider();
}
