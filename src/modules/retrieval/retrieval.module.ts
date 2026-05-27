import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { RetrievalService } from './application/services/retrieval.service';

@Module({
  imports: [StorageModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
