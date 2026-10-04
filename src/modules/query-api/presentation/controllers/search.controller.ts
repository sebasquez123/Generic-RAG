import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainExceptionFilter } from '~/shared/filters/domain-exception.filter';
import { parseOrThrow } from '~/shared/validation/parse-or-throw';
import { QueryService } from '../../application/services/query.service';
import { toSearchResponse } from '../mappers/search.mapper';
import { searchSchema } from '../validators/search.schema';

/** Retrieval API consumed by external LLM servers. It never generates answers. */
@ApiTags('Retrieval')
@Controller('search')
@UseFilters(DomainExceptionFilter)
export class SearchController {
  constructor(private readonly queryService: QueryService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Semantic search over ingested documents',
    description:
      'Returns only chunks above min_score (never padded to top_k), each with content, score, citation and ' +
      'document/chunk metadata. found=false means there is no sufficient evidence.',
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
  @ApiResponse({ status: 502, description: 'Embedding provider failure' })
  async search(@Body() body: unknown) {
    const input = parseOrThrow(searchSchema, body ?? {});
    const outcome = await this.queryService.search({
      query: input.query,
      namespace: input.namespace,
      topK: input.top_k,
      minScore: input.min_score,
      orderBy: input.order_by,
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
