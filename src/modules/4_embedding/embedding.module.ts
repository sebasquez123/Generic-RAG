import { Module } from '@nestjs/common';
import config, { type RagConfig } from '~/config';
import { HttpClientService, HttpModule } from '~/modules/6_http';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { EmbeddingService } from './application/embedding.service';
import { GeminiEmbeddingAdapter } from './adapters/gemini/gemini-embedding.adapter';
import { HashingEmbeddingAdapter } from './adapters/local/hashing-embedding.adapter';
import { EMBEDDING_PROVIDER } from './domain/ports/embedding-provider.port';
import { EmbeddingProviderNotConfiguredError } from './domain/errors/embedding_errors';

@Module({
  imports: [HttpModule],
  providers: [
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (rag: RagConfig, http: HttpClientService) => {
        switch (rag.embedding.provider) {
          case 'gemini':
            return new GeminiEmbeddingAdapter(http, {
              apiKey: config.llm.gemini.apiKey,
              baseUrl: config.llm.gemini.baseUrl,
              model: config.llm.gemini.embeddingModel,
              dimensions: rag.embedding.dimensions,
              timeoutMs: rag.embedding.timeoutMs,
              maxRetries: rag.embedding.maxRetries,
              retryBaseDelayMs: rag.embedding.retryBaseDelayMs,
              queryTimeoutMs: rag.embedding.queryTimeoutMs,
              queryMaxRetries: rag.embedding.queryMaxRetries,
            });
          case 'hashing':
            return new HashingEmbeddingAdapter(rag.embedding.dimensions);
          default:
            throw new EmbeddingProviderNotConfiguredError(
              `Unsupported RAG_EMBEDDING_PROVIDER: ${rag.embedding.provider}`,
            );
        }
      },
      inject: [RAG_CONFIG, HttpClientService],
    },
    EmbeddingService,
  ],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
