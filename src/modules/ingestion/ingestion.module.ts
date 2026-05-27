import { Module } from '@nestjs/common';
import { PdfIngestionAdapter } from './adapters/pdf/pdf-ingestion.adapter';
import { DocumentIngestionService } from './application/services/document-ingestion.service';

@Module({
  providers: [DocumentIngestionService, PdfIngestionAdapter],
  exports: [DocumentIngestionService],
})
export class IngestionModule {}
