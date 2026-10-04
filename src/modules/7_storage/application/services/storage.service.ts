import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentListQuery,
  EmbeddedChunk,
  IngestionCompletion,
  IngestionError,
  IngestionProgress,
  IngestionStage,
  NewDocument,
  VectorSearchQuery,
} from '~/shared/types/semantic-pipeline.type';
import type {
  DocumentRegistryRepository,
  DocumentStorageRepository,
} from '../ports/document-storage.repository';
import {
  DOCUMENT_REGISTRY_REPOSITORY,
  DOCUMENT_STORAGE_REPOSITORY,
} from '../ports/storage.tokens';

/** Public API of the storage module; callers never see SQL or pgvector. */
@Injectable()
export class StorageService {
  constructor(
    @Inject(DOCUMENT_STORAGE_REPOSITORY)
    private readonly chunks: DocumentStorageRepository,
    @Inject(DOCUMENT_REGISTRY_REPOSITORY)
    private readonly documents: DocumentRegistryRepository,
  ) {}

  createDocument(document: NewDocument) {
    return this.documents.create(document);
  }

  findDocument(id: string) {
    return this.documents.findById(id);
  }

  getDocumentFile(id: string) {
    return this.documents.getFileContent(id);
  }

  listDocuments(query: DocumentListQuery) {
    return this.documents.list(query);
  }

  deleteDocument(id: string) {
    return this.documents.delete(id);
  }

  claimForProcessing(id: string, staleBefore: Date) {
    return this.documents.claimForProcessing(id, staleBefore);
  }

  updateProgress(
    id: string,
    stage: IngestionStage,
    progress: IngestionProgress,
  ) {
    return this.documents.updateProgress(id, stage, progress);
  }

  markFailed(id: string, error: IngestionError, progress: IngestionProgress) {
    return this.documents.markFailed(id, error, progress);
  }

  commitIngestion(
    documentId: string,
    chunks: EmbeddedChunk[],
    completion: IngestionCompletion,
  ) {
    return this.chunks.commitIngestion(documentId, chunks, completion);
  }

  searchSimilarChunks(query: VectorSearchQuery) {
    return this.chunks.searchSimilarChunks(query);
  }

  listChunks(documentId: string, limit: number, offset: number) {
    return this.chunks.listChunks(documentId, limit, offset);
  }
}
