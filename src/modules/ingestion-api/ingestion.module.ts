import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module';
import { StorageModule } from '../storage/storage.module';
import { PdfIngestionAdapter } from './adapters/pdf/pdf-ingestion.adapter';
import { DocumentIngestionService } from './application/services/document-ingestion.service';
import { IngestionController } from './presentation/controllers/ingestion.controller';

@Module({
  imports: [EmbeddingModule, StorageModule],
  controllers: [IngestionController],
  providers: [DocumentIngestionService, PdfIngestionAdapter],
  exports: [DocumentIngestionService],
})
export class IngestionModule {}
