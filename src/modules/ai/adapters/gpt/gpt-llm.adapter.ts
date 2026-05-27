import { Injectable } from '@nestjs/common';
import type { LlmServicePort } from '../../application/ports/llm-service.port';
import type {
  StandardLlmRequest,
  StandardLlmResponse,
} from '../../domain/types/llm-provider.type';

@Injectable()
export class GptLlmAdapter implements LlmServicePort {
  readonly provider = 'gpt';

  infer(request: StandardLlmRequest): Promise<StandardLlmResponse> {
    const contextSummary = request.contexts
      .map((context) => context.source)
      .join(', ');

    // Next step: replace this stub with the official OpenAI SDK call.
    // Keep the request and response mapped to StandardLlmRequest/StandardLlmResponse
    // so Gemini, Claude, and DeepSeek adapters can be swapped at runtime.
    return Promise.resolve({
      provider: 'gpt',
      answer: `gpt draft for "${request.question}" using ${contextSummary || 'no retrieved context yet'}.`,
      confidence: 0.92,
    });
  }
}
