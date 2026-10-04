import type {
  DocumentListQuery,
  DocumentRecord,
  EmbeddedChunk,
  IngestionCompletion,
  IngestionError,
  IngestionProgress,
  IngestionStage,
  NewDocument,
  RetrievedContext,
  StoredChunk,
  VectorSearchQuery,
} from '~/shared/types/semantic-pipeline.type';

/** Document registry: files, status and system metadata. */
export interface DocumentRegistryRepository {
  /** Idempotent on (namespace, contentHash): returns the existing row if any. */
  create(
    document: NewDocument,
  ): Promise<{ document: DocumentRecord; created: boolean }>;
  findById(id: string): Promise<DocumentRecord | undefined>;
  getFileContent(id: string): Promise<Buffer | undefined>;
  list(
    query: DocumentListQuery,
  ): Promise<{ items: DocumentRecord[]; total: number }>;
  delete(id: string): Promise<boolean>;
  /**
   * Atomically moves a document to PROCESSING. Returns undefined when another
   * run holds it (PROCESSING and updated after `staleBefore`).
   */
  claimForProcessing(
    id: string,
    staleBefore: Date,
  ): Promise<DocumentRecord | undefined>;
  updateProgress(
    id: string,
    stage: IngestionStage,
    progress: IngestionProgress,
  ): Promise<void>;
  markFailed(
    id: string,
    error: IngestionError,
    progress: IngestionProgress,
  ): Promise<void>;
}

/** Chunk + vector persistence and similarity search. */
export interface DocumentStorageRepository {
  /**
   * Replaces every chunk of the document and marks it COMPLETED in a single
   * transaction: readers see either the previous version or the new one.
   */
  commitIngestion(
    documentId: string,
    chunks: EmbeddedChunk[],
    completion: IngestionCompletion,
  ): Promise<void>;
  searchSimilarChunks(query: VectorSearchQuery): Promise<RetrievedContext[]>;
  listChunks(
    documentId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: StoredChunk[]; total: number }>;
}
