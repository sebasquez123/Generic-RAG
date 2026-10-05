import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '~/shared/auth/api-key.guard';

/**
 * Server-side ingestion console. It is a static page that calls the same
 * public API (/api/v1/documents, /api/v1/search) an external client would use,
 * so it holds no ingestion logic of its own.
 */
// The page itself holds no data; its API calls carry the key the operator types in.
@ApiExcludeController()
@Public()
@Controller('ui')
export class UiController {
  private readonly page = readFileSync(
    join(__dirname, 'public', 'index.html'),
    'utf8',
  );

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  @Header(
    'content-security-policy',
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
  )
  index(): string {
    return this.page;
  }
}
