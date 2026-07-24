import { Module } from '@nestjs/common';

import { HttpModule } from '~/modules/6_http';

import { GeminiLlmService } from './application/services/gemini-llm.service';
import { HuggingFaceLocalLlmService } from './application/services/hugging-face-local-llm.service';
import { OpenAiLlmService } from './application/services/openai-llm.service';
import {
  LLM_PROVIDER_CONFIG,
  LLM_PROVIDER,
  LlmChunkingProviderName,
} from './domain/ports/llm-chunking.port';
import { NotFoundError } from '~/shared/errors';

@Module({
  imports: [HttpModule],
  providers: [
    GeminiLlmService,
    OpenAiLlmService,
    HuggingFaceLocalLlmService,
    {
      provide: LLM_PROVIDER,
      useFactory: (
        gemini: GeminiLlmService,
        openai: OpenAiLlmService,
        huggingFace: HuggingFaceLocalLlmService,
      ) => {
        // aqui la idea es sacar de base de datos, la seleccion del modelo
        const provider = LlmChunkingProviderName.gemini;
        const providers = {
          [LlmChunkingProviderName.gemini]: gemini,
          [LlmChunkingProviderName.openai]: openai,
          [LlmChunkingProviderName.huggingface]: huggingFace,
        };
        const selectedProvider = providers[provider];

        return selectedProvider;
      },
      inject: [GeminiLlmService, OpenAiLlmService, HuggingFaceLocalLlmService],
    },
    {
      provide: LLM_PROVIDER_CONFIG,
      useFactory: () => {
        const provider: LlmChunkingProviderName = LlmChunkingProviderName.gemini as LlmChunkingProviderName;
        switch (provider) {
          case LlmChunkingProviderName.gemini: {
            return {
              CHUNKING_PROVIDER: process.env.GEMINI_CHUNKING_PROVIDER,
              CHUNKING_PROMPT: process.env.GEMINI_CHUNKING_PROMPT,
              EMBEDDING_PROVIDER: process.env.GEMINI_EMBEDDING_PROVIDER,
              EMBEDDING_PROMPT: process.env.GEMINI_EMBEDDING_PROMPT,
              API_KEY: process.env.GEMINI_API_KEY,
              FORMAT_DEMANDED: process.env.GEMINI_FORMAT_DEMANDED,
              BASE_URL: process.env.GEMINI_BASE_URL,
              PROVIDER_NAME: process.env.GEMINI_PROVIDER_NAME,
            }
          }
          case LlmChunkingProviderName.openai: {
            return {
              CHUNKING_PROVIDER: process.env.OPENAI_CHUNKING_PROVIDER,
              CHUNKING_PROMPT: process.env.OPENAI_CHUNKING_PROMPT,
              EMBEDDING_PROVIDER: process.env.OPENAI_EMBEDDING_PROVIDER,
              EMBEDDING_PROMPT: process.env.OPENAI_EMBEDDING_PROMPT,
              API_KEY: process.env.OPENAI_API_KEY,
              FORMAT_DEMANDED: process.env.OPENAI_FORMAT_DEMANDED,
              BASE_URL: process.env.OPENAI_BASE_URL,
              PROVIDER_NAME: process.env.OPENAI_PROVIDER_NAME,
            }
          }
          case LlmChunkingProviderName.huggingface: {
            return {
              CHUNKING_PROVIDER: process.env.HUGGINGFACE_CHUNKING_PROVIDER,
              CHUNKING_PROMPT: process.env.HUGGINGFACE_CHUNKING_PROMPT,
              EMBEDDING_PROVIDER: process.env.HUGGINGFACE_EMBEDDING_PROVIDER,
              EMBEDDING_PROMPT: process.env.HUGGINGFACE_EMBEDDING_PROMPT,
              API_KEY: process.env.HUGGINGFACE_API_KEY,
              FORMAT_DEMANDED: process.env.HUGGINGFACE_FORMAT_DEMANDED,
              BASE_URL: process.env.HUGGINGFACE_BASE_URL,
              PROVIDER_NAME: process.env.HUGGINGFACE_PROVIDER_NAME,
            }
          }
          default:
            throw new NotFoundError(`Unsupported LLM provider: ${provider}`, 'llm.module');
        }
      }
    }
  ],
  exports: [LLM_PROVIDER, LLM_PROVIDER_CONFIG, GeminiLlmService],
})
export class LlmsModule { }
