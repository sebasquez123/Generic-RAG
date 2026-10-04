import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import config from '~/config';
import { DomainExceptionFilter } from '~/shared/filters/domain-exception.filter';
import { IngestionStatus } from '~/shared/types/semantic-pipeline.type';
import { uuidSchema } from '~/shared/validation/common.schema';
import { parseOrThrow } from '~/shared/validation/parse-or-throw';
import { decodeFileName } from '../helpers/multipart';
import { DocumentsService } from '../../application/documents.service';
import { DocumentIngestionService } from '../../application/orchestrator.service';
import {
  toChunkResponse,
  toChunkingOverrides,
  toDocumentResponse,
} from '../mappers/document.mapper';
import {
  ingestDocumentSchema,
  listChunksSchema,
  listDocumentsSchema,
  uploadDocumentSchema,
} from '../validators/documents.schema';

@ApiTags('Documents')
@Controller('documents')
@UseFilters(DomainExceptionFilter)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly ingestion: DocumentIngestionService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Upload a PDF, XLSX, TXT/MD or JSON document',
    description:
      'Registers the file (deduplicated by SHA-256 per namespace). Send ingest=true to start processing immediately.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        namespace: { type: 'string', example: 'default' },
        source: { type: 'string', example: 'finance/2025/annual-report.pdf' },
        document_type: { type: 'string', enum: ['pdf', 'xlsx', 'txt', 'json'] },
        metadata: {
          type: 'string',
          example: '{"year":2025,"department":"finance"}',
        },
        tags: { type: 'string', example: 'finance,annual' },
        ingest: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Document registered' })
  @ApiResponse({
    status: 200,
    description: 'Same file already registered in this namespace',
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: config.rag.maxFileBytes } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!file?.buffer)
      throw new BadRequestException(
        'file is required (multipart field "file")',
      );
    const input = parseOrThrow(uploadDocumentSchema, body ?? {});

    const { document, created } = await this.documents.register({
      file: {
        buffer: file.buffer,
        fileName: decodeFileName(file.originalname),
        mimeType: file.mimetype,
      },
      namespace: input.namespace,
      source: input.source,
      documentType: input.document_type,
      metadata: input.metadata,
      tags: input.tags,
    });

    let current = document;
    // A duplicate upload of a file already being processed is still a valid upload.
    if (
      input.ingest &&
      !(document.status === IngestionStatus.Processing && !created)
    )
      current = (await this.ingestion.start(document.id)).document;

    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return {
      duplicate: !created,
      document: toDocumentResponse(
        current,
        this.ingestion.requiresReindex(current),
      ),
    };
  }

  @Post(':id/ingest')
  @ApiOperation({
    summary: 'Run the ingestion pipeline for a document',
    description:
      'Returns 202 and processes in the background (poll GET /documents/{id}); wait=true processes synchronously. ' +
      'Already-ingested documents with the same pipeline versions are skipped unless force=true.',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        force: { type: 'boolean' },
        wait: { type: 'boolean' },
        chunking: {
          type: 'object',
          properties: {
            strategy: { type: 'string', enum: ['auto', 'recursive', 'table'] },
            chunk_size: { type: 'integer', example: 1200 },
            chunk_overlap: { type: 'integer', example: 200 },
            table_max_rows_per_chunk: { type: 'integer', example: 20 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'Ingestion started' })
  @ApiResponse({
    status: 200,
    description: 'Finished (wait=true) or already up to date',
  })
  @ApiResponse({
    status: 409,
    description: 'Document is already being processed',
  })
  async ingest(
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const documentId = parseOrThrow(uuidSchema, id);
    const input = parseOrThrow(ingestDocumentSchema, body ?? {});
    const result = await this.ingestion.start(documentId, {
      chunking: toChunkingOverrides(input.chunking),
      force: input.force,
      wait: input.wait,
    });

    const accepted = result.started && !input.wait;
    response.status(accepted ? HttpStatus.ACCEPTED : HttpStatus.OK);
    return {
      started: result.started,
      reason: result.reason ?? null,
      document: toDocumentResponse(
        result.document,
        this.ingestion.requiresReindex(result.document),
      ),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List documents (optionally by namespace/status)' })
  async list(@Query() query: Record<string, unknown>) {
    const input = parseOrThrow(listDocumentsSchema, query);
    const { items, total } = await this.documents.list(input);
    return {
      total,
      limit: input.limit,
      offset: input.offset,
      items: items.map((item) =>
        toDocumentResponse(item, this.ingestion.requiresReindex(item)),
      ),
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Document status, progress, error stage and system metadata',
  })
  async get(@Param('id') id: string) {
    const document = await this.documents.get(parseOrThrow(uuidSchema, id));
    return toDocumentResponse(
      document,
      this.ingestion.requiresReindex(document),
    );
  }

  @Get(':id/chunks')
  @ApiOperation({
    summary: 'Inspect stored chunks of a document (traceability)',
  })
  async chunks(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    const input = parseOrThrow(listChunksSchema, query);
    const { items, total } = await this.documents.listChunks(
      parseOrThrow(uuidSchema, id),
      input.limit,
      input.offset,
    );
    return {
      total,
      limit: input.limit,
      offset: input.offset,
      items: items.map(toChunkResponse),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document and all of its chunks' })
  async remove(@Param('id') id: string) {
    await this.documents.delete(parseOrThrow(uuidSchema, id));
  }
}
