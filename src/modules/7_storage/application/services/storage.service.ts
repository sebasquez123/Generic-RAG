import { Inject, Injectable } from '@nestjs/common';
import type {
  EmbeddedDocumentChunk,
  RetrievedContext,
} from '../../../../shared/types/semantic-pipeline.type';
import type { DocumentStorageRepository } from '../ports/document-storage.repository';
import { DOCUMENT_STORAGE_REPOSITORY } from '../ports/storage.tokens';

@Injectable()
export class StorageService {
  constructor(
    @Inject(DOCUMENT_STORAGE_REPOSITORY)
    private readonly repository: DocumentStorageRepository,
  ) {}

  searchSimilarContexts(
    question: string,
    limit: number,
  ): Promise<RetrievedContext[]> {
    return this.repository.searchSimilarContexts(question, limit);
  }

  storeDocumentChunks(chunks: EmbeddedDocumentChunk[]): Promise<boolean> {
    return this.repository.storeDocumentChunks(chunks);
  }
}
