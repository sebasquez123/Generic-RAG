import { Inject, Injectable } from '@nestjs/common';
import type { SupportedModelProvider } from '../../../RAG/types/rag-shared.type';
import type {
  StandardLlmRequest,
  StandardLlmResponse,
} from '../../domain/types/llm-provider.type';
import { LLM_SERVICE_ADAPTERS } from '../ports/ai.tokens';
import type { LlmServicePort } from '../ports/llm-service.port';

@Injectable()
export class LlmModelSelectorService {
  constructor(
    @Inject(LLM_SERVICE_ADAPTERS)
    private readonly adapters: LlmServicePort[],
  ) {}

  async infer(request: StandardLlmRequest): Promise<StandardLlmResponse[]> {
    const adapter = this.selectAdapter(request.provider ?? 'gpt');
    return [await adapter.infer(request)];
  }

  private selectAdapter(provider: SupportedModelProvider): LlmServicePort {
    const adapter = this.adapters.find(
      (candidate) => candidate.provider === provider,
    );

    if (!adapter) {
      throw new Error(`No LLM adapter registered for provider: ${provider}`);
    }

    return adapter;
  }
}
