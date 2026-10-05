import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IngestionModule } from '../1_ingestion-api/ingestion.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, IngestionModule],
  controllers: [HealthController],
})
export class HealthModule {}
