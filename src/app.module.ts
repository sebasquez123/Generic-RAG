import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from './modules/database/database.module';
import { EmbeddingModule } from './modules/4_embedding/embedding.module';
import { FormatterModule } from './modules/2_chunker/chunking.module';
import { IngestionModule } from './modules/1_ingestion-api/ingestion.module';
import { QueryModule } from './modules/query-api/query.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { StorageModule } from './modules/7_storage/storage.module';
import { UserContextMiddleware } from './shared/middleware/context/req-context.middleware';

@Module({
  imports: [
    DatabaseModule,
    EmbeddingModule,
    FormatterModule,
    IngestionModule,
    QueryModule,
    RetrievalModule,
    ScoringModule,
    StorageModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(UserContextMiddleware).forRoutes('*');
  }
}
