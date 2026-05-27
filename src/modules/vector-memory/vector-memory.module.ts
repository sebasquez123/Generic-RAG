import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PgVectorContextRepository } from './adapters/postgres/pgvector-context.repository';
import { VECTOR_CONTEXT_REPOSITORY } from './application/ports/vector-memory.tokens';
import { VectorMemoryService } from './application/services/vector-memory.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    VectorMemoryService,
    PgVectorContextRepository,
    {
      provide: VECTOR_CONTEXT_REPOSITORY,
      useExisting: PgVectorContextRepository,
    },
  ],
  exports: [VectorMemoryService],
})
export class VectorMemoryModule {}
