import { Module } from '@nestjs/common';
import { GeminiInfrastructureService } from '../../infrastructure/gemini/gemini.service';
import { EmbeddingModule } from '../embedding/embedding.module';
import { StorageModule } from '../storage/storage.module';
import { PdfIngestionAdapter } from './application/formats/adapters/pdf/pdf-ingestion.adapter';
import { StructuredIngestionAdapter } from './application/formats/adapters/structured/structured-ingestion.adapter';
import { TextIngestionAdapter } from './application/formats/adapters/text/text-ingestion.adapter';
import { DocumentIngestionService } from './application/orchestrator.service';
import { IngestionController } from './presentation/controllers/ingestion.controller';
import { INGESTION_ADAPTERS } from './application/ports/ingestion-format-port.port';

@Module({
  imports: [EmbeddingModule, StorageModule],
  controllers: [IngestionController],
  providers: [
    GeminiInfrastructureService,
    PdfIngestionAdapter,
    StructuredIngestionAdapter,
    TextIngestionAdapter,
    DocumentIngestionService,
    {
      provide: INGESTION_ADAPTERS,
      useFactory: (
        text: TextIngestionAdapter,
        pdf: PdfIngestionAdapter,
        structured: StructuredIngestionAdapter,
      ) => [text, pdf, structured],
      inject: [
        TextIngestionAdapter,
        PdfIngestionAdapter,
        StructuredIngestionAdapter,
      ],
    },
  ],
  exports: [DocumentIngestionService],
})
export class IngestionModule {}
