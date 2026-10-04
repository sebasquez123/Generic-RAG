import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../4_embedding/embedding.module';
import { ChunkingModule } from '../2_chunker/chunking.module';
import { StorageModule } from '../7_storage/storage.module';
import { PdfIngestionAdapter } from './application/formats/adapters/pdf/pdf-ingestion.adapter';
import { StructuredIngestionAdapter } from './application/formats/adapters/structured/structured-ingestion.adapter';
import { XlsxIngestionAdapter } from './application/formats/adapters/structured/xlsx-ingestion.adapter';
import { TextIngestionAdapter } from './application/formats/adapters/text/text-ingestion.adapter';
import { DocumentsService } from './application/documents.service';
import { DocumentIngestionService } from './application/orchestrator.service';
import { INGESTION_ADAPTERS } from './application/ports/ingestion-format.port';
import { DocumentsController } from './presentation/controllers/documents.controller';
import { IngestionController } from './presentation/controllers/ingestion.controller';

@Module({
  imports: [EmbeddingModule, ChunkingModule, StorageModule],
  controllers: [DocumentsController, IngestionController],
  providers: [
    PdfIngestionAdapter,
    XlsxIngestionAdapter,
    StructuredIngestionAdapter,
    TextIngestionAdapter,
    DocumentsService,
    DocumentIngestionService,
    {
      provide: INGESTION_ADAPTERS,
      useFactory: (
        text: TextIngestionAdapter,
        pdf: PdfIngestionAdapter,
        xlsx: XlsxIngestionAdapter,
        structured: StructuredIngestionAdapter,
      ) => [text, pdf, xlsx, structured],
      inject: [
        TextIngestionAdapter,
        PdfIngestionAdapter,
        XlsxIngestionAdapter,
        StructuredIngestionAdapter,
      ],
    },
  ],
  exports: [DocumentsService, DocumentIngestionService],
})
export class IngestionModule {}
