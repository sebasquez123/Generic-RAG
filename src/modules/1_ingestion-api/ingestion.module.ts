import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../4_embedding/embedding.module';
import { FormatterModule } from '../2_chunker/chunking.module';
import { StorageModule } from '../7_storage/storage.module';
import { PdfIngestionAdapter } from './application/formats/adapters/pdf/pdf-ingestion.adapter';
import { StructuredIngestionAdapter } from './application/formats/adapters/structured/structured-ingestion.adapter';
import { TextIngestionAdapter } from './application/formats/adapters/text/text-ingestion.adapter';
import { DocumentIngestionService } from './application/orchestrator.service';
import { IngestionController } from './presentation/controllers/ingestion.controller';
import { INGESTION_ADAPTERS } from './application/ports/ingestion-format.port';

@Module({
  imports: [EmbeddingModule, FormatterModule, StorageModule],
  controllers: [IngestionController],
  providers: [
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
export class IngestionModule { }
