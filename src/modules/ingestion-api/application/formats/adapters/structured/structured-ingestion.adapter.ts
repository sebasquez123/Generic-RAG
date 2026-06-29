import { Injectable } from '@nestjs/common';
import { GeminiInfrastructureService } from '~/infrastructure/gemini/gemini.service';
import type {
  IngestionFormatAdapter,
  IngestionFormatInput,
} from '~/modules/ingestion-api/application/ports/ingestion-format-port.port';
import { CustomJsonNoFormattedError } from '~/modules/ingestion-api/domain/errors/domain_errors';
import { LoggerService } from '~/shared/logging/main.logger';
import {
  FormattedIngestionChunk,
  sourceType,
} from '~/shared/types/semantic-pipeline.type';

@Injectable()
export class StructuredIngestionAdapter implements IngestionFormatAdapter {
  readonly type = sourceType.Structured;
  private readonly logger = new LoggerService(StructuredIngestionAdapter.name);
  
  constructor(private readonly gemini: GeminiInfrastructureService) {}

  async format(
    input: IngestionFormatInput,
  ): Promise<FormattedIngestionChunk[]> {
    const serialized = JSON.stringify(input.data ?? {}, null, 2);
    const chunks = await this.gemini.chunkText(serialized);
    const chunksProcessed: FormattedIngestionChunk[] = chunks.map((content, index) => ({
      source: input.source,
      content,
      metadata: {
        type: this.type,
        chunkIndex: index,
      },
    }));

    if (chunksProcessed.length === 0) throw new CustomJsonNoFormattedError(`No formatted chunks were generated from the structured source ${input.source}`, input.source);

    this.logger.log(`Processed ${chunksProcessed.length} chunks from structured source ${input.source}`);
    return chunksProcessed;
  }
}
