import { Injectable } from '@nestjs/common';
import { ChunkingService } from '~/modules/2_chunker/application/chunking.service';
import type {
  IngestionFormatPort,
  IngestionFormatInput,
} from '~/modules/1_ingestion-api/application/ports/ingestion-format.port';
import {
  FormattedIngestionChunk,
  sourceType,
} from '~/shared/types/semantic-pipeline.type';
import { LoggerService } from '~/shared/logging/main.logger';
import { PDFNoFormattedError } from '~/modules/1_ingestion-api/domain/errors/domain_errors';

@Injectable()
export class PdfIngestionAdapter implements IngestionFormatPort {
  readonly type = sourceType.Pdf;
  private readonly logger = new LoggerService(PdfIngestionAdapter.name);

  constructor(private readonly chunker: ChunkingService) { }

  async format(
    input: IngestionFormatInput,
  ): Promise<FormattedIngestionChunk[]> {
    const extractedText = this.extractReadableText(input);
    const chunksProcessed = await this.chunker.chunkPDF({
      source: input.source,
      type: this.type,
      content: extractedText,
      metadata: {
        fileName: input.file?.originalname,
        mimeType: input.file?.mimetype,
      },
    });

    if (chunksProcessed.length === 0)
      throw new PDFNoFormattedError(
        `No readable text could be extracted from the PDF file ${input.file?.originalname ?? input.source}`,
        input.source,
      );

    this.logger.log(
      `Processed ${chunksProcessed.length} chunks from PDF file ${input.file?.originalname ?? input.source}`,
    );
    return chunksProcessed;
  }

  private extractReadableText(input: IngestionFormatInput): string {
    const rawText = input.file?.buffer.toString('utf8') ?? '';
    const sanitizedText = rawText
      .replace(/[^\u0009\u000A\u000D\u0020-\u007E]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return sanitizedText;
  }
}
