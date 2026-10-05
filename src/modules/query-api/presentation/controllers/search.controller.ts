import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPrincipal, RequireScope } from '~/shared/auth/api-key.guard';
import type { Principal } from '~/shared/auth/principal';
import { DomainExceptionFilter } from '~/shared/filters/domain-exception.filter';
import { parseOrThrow } from '~/shared/validation/parse-or-throw';
import { QueryService } from '../../application/services/query.service';
import { toSearchResponse } from '../mappers/search.mapper';
import { searchSchema } from '../validators/search.schema';

/** Retrieval API consumed by external LLM servers. It never generates answers. */
@ApiTags('Retrieval')
@ApiSecurity('api-key')
@Controller('search')
@UseFilters(DomainExceptionFilter)
export class SearchController {
  constructor(private readonly queryService: QueryService) {}

  @Post()
  @RequireScope('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Semantic search over ingested documents',
    description:
      'Returns qualifying evidence only (never padded to top_k): content, citation, source/version, signals. ' +
      'verdict.status tells sufficient | partial | weak | none; coverage tells what could not be searched.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', example: '¿Cuál fue la facturación de 2025?' },
        top_k: { type: 'integer', example: 5 },
        min_score: { type: 'number', example: 0.6 },
        namespace: { type: 'string', example: 'default' },
        order_by: { type: 'string', enum: ['score', 'document'] },
        mode: {
          type: 'string',
          enum: ['hybrid', 'vector'],
          description:
            'hybrid (default): vector + full-text, exact ids/codes/numbers can qualify; vector: similarity only',
        },
        filters: {
          type: 'object',
          properties: {
            document_ids: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
            },
            document_types: {
              type: 'array',
              items: { type: 'string', enum: ['pdf', 'xlsx', 'txt', 'json'] },
            },
            sources: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            sheets: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object', example: { year: 2025 } },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Search results (possibly empty with found=false)',
  })
  @ApiResponse({
    status: 503,
    description: 'Embedding provider unavailable (retryable: true)',
  })
  async search(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ) {
    const input = parseOrThrow(searchSchema, body ?? {});
    const outcome = await this.queryService.search({
      query: input.query,
      namespace: input.namespace,
      access: principal.namespaces,
      topK: input.top_k,
      minScore: input.min_score,
      orderBy: input.order_by,
      mode: input.mode,
      filters: {
        documentIds: input.filters?.document_ids,
        documentTypes: input.filters?.document_types,
        sources: input.filters?.sources,
        tags: input.filters?.tags,
        sheets: input.filters?.sheets,
        metadata: input.filters?.metadata,
      },
    });
    return toSearchResponse(outcome);
  }
}
