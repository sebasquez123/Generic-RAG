import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from './modules/database/database.module';
import { EmbeddingModule } from './modules/embedding/embedding.module';
import { FormatterModule } from './modules/formatter/formatter.module';
import { IngestionModule } from './modules/ingestion-api/ingestion.module';
import { QueryModule } from './modules/query-api/query.module';
import { RetrievalModule } from './modules/retrieval/retrieval.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { StorageModule } from './modules/storage/storage.module';
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
