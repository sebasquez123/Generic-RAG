import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { DocumentIngestionService } from '../../application/services/document-ingestion.service';
import type { IngestTextDto } from '../dto/ingest-text.dto';
import { ingestTextSchema } from '../validators/ingest-text.schema';

@Controller('ingestion')
export class IngestionController {
  constructor(private readonly documentIngestion: DocumentIngestionService) {}

  @Get('lineup')
  getLineup() {
    return {
      purpose: 'Ingestion API module composition',
      ingestionModule: 'ingestion/text-and-pdf',
      embeddingModule: 'embedding/text-to-vector',
      storageModule: 'storage/postgres-pgvector',
    };
  }

  @Post('text')
  ingestText(@Body() body: IngestTextDto) {
    // MVP next endpoints: POST /ingestion/pdf for uploaded PDFs and
    // POST /ingestion/structured for caller-defined JSON shapes.
    const parsed = ingestTextSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.documentIngestion.ingestText(parsed.data);
  }
}
