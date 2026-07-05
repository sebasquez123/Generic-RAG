import { Injectable } from '@nestjs/common';
import { StorageService } from '../../../7_storage/application/services/storage.service';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';

@Injectable()
export class RetrievalService {
  constructor(private readonly storage: StorageService) { }

  retrieve(question: string, limit: number): Promise<RetrievedContext[]> {
    return this.storage.searchSimilarContexts(question, limit);
  }
}
