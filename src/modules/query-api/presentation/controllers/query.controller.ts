import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { QueryService } from '../../application/services/query.service';
import type { FetchQueryDto } from '../dto/fetch-query.dto';
import { fetchQuerySchema } from '../validators/fetch-query.schema';

@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Get('lineup')
  getLineup() {
    return {
      purpose: 'Query module data fetching',
      retrievalModule: 'retrieval/postgres-pgvector',
      scoringModule: 'scoring/context-rank',
      storageModule: 'storage/postgres-pgvector',
    };
  }

  @Post('fetch')
  fetch(@Body() body: FetchQueryDto) {
    const parsed = fetchQuerySchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    return this.queryService.fetchContexts(
      parsed.data.question,
      parsed.data.contextLimit,
    );
  }
}
