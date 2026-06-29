import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { DocumentIngestionService } from '../../application/orchestrator.service';
import type { IngestTextDto } from '../dto/ingest-text.dto';
import type { IngestStructuredDto } from '../dto/ingest-structured.dto';
import type { IngestPdfDto } from '../dto/ingest-pdf.dto';
import { ingestTextSchema } from '../validators/ingest-text.schema';
import { ingestStructuredSchema } from '../validators/ingest-structured.schema';
import { ingestPdfSchema } from '../validators/ingest-pdf.schema';
import { LoggerService } from '~/shared/logging/main.logger';
import { sourceType } from '~/shared/types/semantic-pipeline.type';
import { InternalServerError } from '~/shared/errors';

@ApiTags('Ingestion')
@Controller('ingestion')
export class IngestionController {
  private readonly logger = new LoggerService('IngestionController');
  constructor(private readonly documentIngestion: DocumentIngestionService) {}

  @ApiOperation({ summary: 'Ingest plain text content' })
  @ApiResponse({ status: 201, description: 'Document ingested (text)' })
  @ApiResponse({ status: 400, description: 'Invalid request format' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @Post('text')
  ingestText(@Body() body: IngestTextDto) {
    try{
      const parsed = ingestTextSchema.safeParse(body);

      if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

      return this.documentIngestion.ingest(sourceType.Text, parsed.data);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error ingesting text data', errorMessage);
      throw new InternalServerError('Failed to ingest text data');
    }
    
  }


  @ApiOperation({ summary: 'Ingest structured JSON data' })
  @ApiResponse({ status: 201, description: 'Document ingested (structured)' })
  @ApiResponse({ status: 400, description: 'Invalid request format' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @Post('structured')
  ingestStructured(@Body() body: IngestStructuredDto) {
    try{
      const parsed = ingestStructuredSchema.safeParse(body);

      if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

      return this.documentIngestion.ingest(sourceType.Structured, parsed.data);
     } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error ingesting structured data', errorMessage);
      throw new InternalServerError('Failed to ingest structured data');
    }
  }


  @ApiOperation({ summary: 'Ingest PDF (multipart/form-data upload)' })
  @ApiResponse({ status: 201, description: 'Document ingested (pdf)' })
  @ApiResponse({ status: 400, description: 'Invalid request format' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @ApiConsumes('multipart/form-data')
  @Post('pdf')
  @UseInterceptors(FileInterceptor('file'))
  ingestPdf(
    @UploadedFile() file,
    @Body() body: IngestPdfDto,
  ) {
    try {
    this.logger.log(JSON.stringify({
      message: 'Received PDF ingestion request',
      fileName: file?.originalname,
      fileSize: file?.size,
      body,
    }));

    const parsed = ingestPdfSchema.safeParse({ source: body?.source, file });

    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    return this.documentIngestion.ingest(sourceType.Pdf, parsed.data);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error ingesting PDF', errorMessage);
      throw new InternalServerError('Failed to ingest PDF');
  }
}
}