import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequireScope } from '~/shared/auth/api-key.guard';
import type { Principal } from '~/shared/auth/principal';
import { DomainExceptionFilter } from '~/shared/filters/domain-exception.filter';
import { parseOrThrow } from '~/shared/validation/parse-or-throw';
import { QueryService } from '../../application/services/query.service';
import type { FetchQueryDto } from '../dto/fetch-query.dto';
import { toSearchResult } from '../mappers/search.mapper';
import { fetchQuerySchema } from '../validators/fetch-query.schema';

@ApiTags('Query (legacy)')
@ApiSecurity('api-key')
@Controller('query')
@UseFilters(DomainExceptionFilter)
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Get('lineup')
  @RequireScope('read')
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
  @RequireScope('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Legacy retrieval endpoint; prefer POST /search',
    deprecated: true,
  })
  async fetch(
    @Body() body: FetchQueryDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    const input = parseOrThrow(fetchQuerySchema, body ?? {});
    const outcome = await this.queryService.search({
      access: principal.namespaces,
      query: input.question,
      topK: input.contextLimit,
    });
    return outcome.results.map(toSearchResult);
  }
}
