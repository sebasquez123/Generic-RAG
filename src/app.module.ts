import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './modules/database/database.module';
import { EmbeddingModule } from './modules/4_embedding/embedding.module';
import { ChunkingModule } from './modules/2_chunker/chunking.module';
import { IngestionModule } from './modules/1_ingestion-api/ingestion.module';
import { QueryModule } from './modules/query-api/query.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { StorageModule } from './modules/7_storage/storage.module';
import { UiModule } from './modules/8_ui/ui.module';
import { HealthModule } from './modules/health/health.module';
import { ApiKeyGuard } from './shared/auth/api-key.guard';
import { RagConfigModule } from './shared/config/rag-config.module';
import { UserContextMiddleware } from './shared/middleware/context/req-context.middleware';

@Module({
  imports: [
    RagConfigModule,
    DatabaseModule,
    EmbeddingModule,
    ChunkingModule,
    IngestionModule,
    QueryModule,
    RetrievalModule,
    ScoringModule,
    StorageModule,
    UiModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(UserContextMiddleware).forRoutes('*');
  }
}
