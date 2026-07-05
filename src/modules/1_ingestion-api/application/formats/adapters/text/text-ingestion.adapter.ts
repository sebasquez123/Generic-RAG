import { Injectable } from '@nestjs/common';
import { ChunkingService } from '~/modules/2_chunker/application/chunking.service';
import type {
  IngestionFormatPort,
  IngestionFormatInput,
} from '~/modules/1_ingestion-api/application/ports/ingestion-format.port';
import { TextNoFormattedError } from '~/modules/1_ingestion-api/domain/errors/domain_errors';
import { LoggerService } from '~/shared/logging/main.logger';
import {
  FormattedIngestionChunk,
  sourceType,
} from '~/shared/types/semantic-pipeline.type';

@Injectable()
export class TextIngestionAdapter implements IngestionFormatPort {
  readonly type = sourceType.Text;
  private readonly logger = new LoggerService(TextIngestionAdapter.name);

  constructor(private readonly chunker: ChunkingService) { }

  async format(
    input: IngestionFormatInput,
  ): Promise<FormattedIngestionChunk[]> {
    const chunksProcessed = await this.chunker.chunkText({
      source: input.source,
      type: this.type,
      content: input.content ?? '',
    });

    if (chunksProcessed.length === 0)
      throw new TextNoFormattedError(
        `No formatted chunks were generated from the text source ${input.source}`,
        input.source,
      );

    this.logger.log(
      `Processed ${chunksProcessed.length} chunks from text source ${input.source}`,
    );
    return chunksProcessed;
  }
}
