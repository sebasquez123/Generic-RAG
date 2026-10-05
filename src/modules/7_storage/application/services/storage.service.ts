import { Inject, Injectable } from '@nestjs/common';
import type {
  CandidateSearchQuery,
  ChunkingDescriptor,
  DocumentListQuery,
  EmbeddedChunk,
  IngestionCompletion,
  IngestionError,
  IngestionProgress,
  NewDocument,
  SearchFilters,
} from '~/shared/types/semantic-pipeline.type';
import type {
  DocumentRegistryRepository,
  DocumentStorageRepository,
  LeaseUpdate,
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

  // ------------------------------------------------------ ingestion queue

  enqueue(id: string, chunking: ChunkingDescriptor) {
    return this.documents.enqueue(id, chunking);
  }

  countQueued() {
    return this.documents.countQueued();
  }

  claimNext(runId: string, leaseMs: number, maxAttempts: number) {
    return this.documents.claimNext(runId, leaseMs, maxAttempts);
  }

  failAbandoned(maxAttempts: number) {
    return this.documents.failAbandoned(maxAttempts);
  }

  renewLease(id: string, runId: string, leaseMs: number, update?: LeaseUpdate) {
    return this.documents.renewLease(id, runId, leaseMs, update);
  }

  requeue(id: string, runId: string, error: IngestionError, delayMs: number) {
    return this.documents.requeue(id, runId, error, delayMs);
  }

  markFailed(
    id: string,
    runId: string,
    error: IngestionError,
    progress: IngestionProgress,
  ) {
    return this.documents.markFailed(id, runId, error, progress);
  }

  commitIngestion(
    documentId: string,
    runId: string,
    chunks: EmbeddedChunk[],
    completion: IngestionCompletion,
  ) {
    return this.chunks.commitIngestion(documentId, runId, chunks, completion);
  }

  recordCompletedProgress(id: string, progress: IngestionProgress) {
    return this.documents.recordCompletedProgress(id, progress);
  }

  // ------------------------------------------------------------ retrieval

  searchCandidates(query: CandidateSearchQuery) {
    return this.chunks.searchCandidates(query);
  }

  coverage(
    namespace: string,
    filters: SearchFilters,
    embeddingVersion: string,
  ) {
    return this.documents.coverage(namespace, filters, embeddingVersion);
  }

  listChunks(documentId: string, limit: number, offset: number) {
    return this.chunks.listChunks(documentId, limit, offset);
  }
}
