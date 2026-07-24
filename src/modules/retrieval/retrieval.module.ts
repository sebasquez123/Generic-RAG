import { Module } from '@nestjs/common';
import { StorageModule } from '../7_storage/storage.module';
import { RetrievalService } from './application/services/retrieval.service';

@Module({
  imports: [StorageModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule { }
