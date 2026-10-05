import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import config from '~/config';
import { CurrentPrincipal, RequireScope } from '~/shared/auth/api-key.guard';
import type { Principal } from '~/shared/auth/principal';
import { DomainExceptionFilter } from '~/shared/filters/domain-exception.filter';
import { DocumentType } from '~/shared/types/semantic-pipeline.type';
import { DocumentsService } from '../../application/documents.service';
import { DocumentIngestionService } from '../../application/orchestrator.service';
import type { IngestionFileInput } from '../../application/ports/ingestion-format.port';
import type { IngestTextDto } from '../dto/ingest-text.dto';
import type { IngestStructuredDto } from '../dto/ingest-structured.dto';
import type { IngestPdfDto } from '../dto/ingest-pdf.dto';
import { toDocumentResponse } from '../mappers/document.mapper';
import { ingestTextSchema } from '../validators/ingest-text.schema';
import { ingestStructuredSchema } from '../validators/ingest-structured.schema';
import { ingestPdfSchema } from '../validators/ingest-pdf.schema';
import { parseOrThrow } from '~/shared/validation/parse-or-throw';
import { decodeFileName } from '../helpers/multipart';

/**
 * Backwards-compatible one-shot endpoints (upload + synchronous ingestion).
 * They delegate to the same use cases as /documents; prefer that API.
 */
@ApiTags('Ingestion (legacy)')
@ApiSecurity('api-key')
@Controller('ingestion')
@UseFilters(DomainExceptionFilter)
export class IngestionController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly ingestion: DocumentIngestionService,
  ) {}

  @Get('lineup')
  @RequireScope('read')
  @ApiOperation({ summary: 'Pipeline composition' })
  getLineup() {
    return {
      ingestionModule: 'ingestion/pdf-xlsx-txt-json',
      chunkingModule: 'chunker/section-and-table-aware',
      embeddingModule: 'embedding/text-to-vector',
      storageModule: 'storage/postgres-pgvector',
    };
  }

  @Post('text')
  @RequireScope('write')
  @ApiOperation({
    summary: 'Ingest plain text content (synchronous)',
    deprecated: true,
  })
  @ApiResponse({ status: 201, description: 'Document ingested (text)' })
  ingestText(
    @Body() body: IngestTextDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    const input = parseOrThrow(ingestTextSchema, body);
    const fileName = input.source.toLowerCase().endsWith('.md')
      ? input.source
      : `${input.source}.txt`;
    return this.registerAndIngest(
      {
        buffer: Buffer.from(input.content, 'utf8'),
        fileName,
        mimeType: 'text/plain',
      },
      input.source,
      DocumentType.Txt,
      principal,
    );
  }

  @Post('structured')
  @RequireScope('write')
  @ApiOperation({
    summary: 'Ingest caller-shaped JSON data (synchronous)',
    deprecated: true,
  })
  @ApiResponse({ status: 201, description: 'Document ingested (structured)' })
  ingestStructured(
    @Body() body: IngestStructuredDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    const input = parseOrThrow(ingestStructuredSchema, body);
    const json =
      typeof input.data === 'string' ? input.data : JSON.stringify(input.data);
    return this.registerAndIngest(
      {
        buffer: Buffer.from(json, 'utf8'),
        fileName: `${input.source}.json`,
        mimeType: 'application/json',
      },
      input.source,
      DocumentType.Json,
      principal,
    );
  }

  @Post('pdf')
  @RequireScope('write')
  @ApiOperation({
    summary: 'Ingest PDF (multipart/form-data, synchronous)',
    deprecated: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Document ingested (pdf)' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: config.rag.maxFileBytes } }),
  )
  ingestPdf(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: IngestPdfDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!file?.buffer) throw new BadRequestException('file is required');
    const input = parseOrThrow(ingestPdfSchema, { source: body?.source });
    return this.registerAndIngest(
      {
        buffer: file.buffer,
        fileName: decodeFileName(file.originalname),
        mimeType: file.mimetype,
      },
      input.source,
      DocumentType.Pdf,
      principal,
    );
  }

  private async registerAndIngest(
    file: IngestionFileInput,
    source: string,
    documentType: DocumentType,
    principal: Principal,
  ) {
    const { document } = await this.documents.register({
      file,
      source,
      documentType,
      access: principal.namespaces,
    });
    const result = await this.ingestion.start(document, { wait: true });
    return toDocumentResponse(
      result.document,
      this.ingestion.requiresReindex(result.document),
    );
  }
}
