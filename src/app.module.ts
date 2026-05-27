import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DatabaseModule } from './modules/database/database.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { RagModule } from './modules/RAG/rag.module';
import { UserContextMiddleware } from './shared/middleware/user-context/user-context.middleware';

@Module({
  imports: [DatabaseModule, IngestionModule, ModerationModule, RagModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(UserContextMiddleware).forRoutes('*');
  }
}
