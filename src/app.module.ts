import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from './modules/database/database.module';
import { EmbeddingModule } from './modules/4_embedding/embedding.module';
import { ChunkingModule } from './modules/2_chunker/chunking.module';
import { IngestionModule } from './modules/1_ingestion-api/ingestion.module';
import { QueryModule } from './modules/query-api/query.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { StorageModule } from './modules/7_storage/storage.module';
import { UiModule } from './modules/8_ui/ui.module';
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(UserContextMiddleware).forRoutes('*');
  }
}
