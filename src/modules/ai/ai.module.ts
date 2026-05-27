import { Module } from '@nestjs/common';
import { GptLlmAdapter } from './adapters/gpt/gpt-llm.adapter';
import { LLM_SERVICE_ADAPTERS } from './application/ports/ai.tokens';
import { LlmModelSelectorService } from './application/services/llm-model-selector.service';

@Module({
  providers: [
    GptLlmAdapter,
    LlmModelSelectorService,
    {
      provide: LLM_SERVICE_ADAPTERS,
      useFactory: (gptAdapter: GptLlmAdapter) => [gptAdapter],
      inject: [GptLlmAdapter],
    },
  ],
  exports: [LlmModelSelectorService],
})
export class AiModule {}
