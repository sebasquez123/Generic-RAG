import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module';
import { StorageModule } from '../storage/storage.module';
import { PdfIngestionAdapter } from './application/formats/adapters/pdf/pdf-ingestion.adapter';
import { DocumentIngestionService } from './application/orchestrator.service';
import { IngestionController } from './presentation/controllers/ingestion.controller';

@Module({
  imports: [EmbeddingModule, StorageModule],
  controllers: [IngestionController],
  providers: [DocumentIngestionService, PdfIngestionAdapter],
  exports: [DocumentIngestionService],
})
export class IngestionModule {}
