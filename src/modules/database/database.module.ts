import { Module } from '@nestjs/common';
import { PgVectorConnectionService } from './vector/pg-vector-connection.service';

@Module({
  providers: [PgVectorConnectionService],
  exports: [PgVectorConnectionService],
})
export class DatabaseModule {}
