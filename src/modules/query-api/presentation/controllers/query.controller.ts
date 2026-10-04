import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DomainExceptionFilter } from '~/shared/filters/domain-exception.filter';
import { parseOrThrow } from '~/shared/validation/parse-or-throw';
import { QueryService } from '../../application/services/query.service';
import type { FetchQueryDto } from '../dto/fetch-query.dto';
import { toSearchResult } from '../mappers/search.mapper';
import { fetchQuerySchema } from '../validators/fetch-query.schema';

@ApiTags('Query (legacy)')
@Controller('query')
@UseFilters(DomainExceptionFilter)
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Get('lineup')
  getLineup() {
    return {
      purpose: 'Query module data fetching',
      retrievalModule: 'retrieval/postgres-pgvector',
      scoringModule: 'scoring/threshold-dedupe-topk',
      storageModule: 'storage/postgres-pgvector',
    };
  }

  /** Kept for existing callers; same pipeline as POST /search. */
  @Post('fetch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Legacy retrieval endpoint; prefer POST /search',
    deprecated: true,
  })
  async fetch(@Body() body: FetchQueryDto) {
    const input = parseOrThrow(fetchQuerySchema, body ?? {});
    const outcome = await this.queryService.search({
      query: input.question,
      topK: input.contextLimit,
    });
    return outcome.results.map(toSearchResult);
  }
}
