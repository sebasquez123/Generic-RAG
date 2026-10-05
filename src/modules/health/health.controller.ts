import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PgVectorConnectionService } from '~/modules/database/vector/pg-vector-connection.service';
import { IngestionWorker } from '~/modules/1_ingestion-api/application/ingestion.worker';
import { Public } from '~/shared/auth/api-key.guard';

const DB_TIMEOUT_MS = 2000;

/** Liveness + readiness in one call: 200 when PostgreSQL answers, 503 otherwise. */
@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: PgVectorConnectionService,
    private readonly worker: IngestionWorker,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Application and PostgreSQL availability' })
  async check(@Res({ passthrough: true }) response: Response) {
    const startedAt = Date.now();
    const database = await this.pingDatabase();
    const healthy = database === 'up';
    response.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: healthy ? 'ok' : 'unavailable',
      database,
      database_latency_ms: Date.now() - startedAt,
      ingestion_worker: this.worker.status(),
    };
  }

  private async pingDatabase(): Promise<'up' | 'down'> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.db.query('select 1'),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS);
        }),
      ]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
