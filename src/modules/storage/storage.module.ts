import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PgVectorDocumentRepository } from './adapters/postgres/pgvector-document.repository';
import { DOCUMENT_STORAGE_REPOSITORY } from './application/ports/storage.tokens';
import { StorageService } from './application/services/storage.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    PgVectorDocumentRepository,
    StorageService,
    {
      provide: DOCUMENT_STORAGE_REPOSITORY,
      useExisting: PgVectorDocumentRepository,
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
