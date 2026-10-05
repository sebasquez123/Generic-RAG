import type {
  CandidateSearchQuery,
  ChunkingDescriptor,
  DocumentListQuery,
  DocumentRecord,
  EmbeddedChunk,
  IngestionCompletion,
  IngestionError,
  IngestionProgress,
  IngestionStage,
  NewDocument,
  RetrievedContext,
  SearchCoverage,
  SearchFilters,
  StoredChunk,
} from '~/shared/types/semantic-pipeline.type';

/**
 * The run no longer owns the document (its lease expired and another worker
 * reclaimed it, or the document was deleted). The run must stop without
 * touching the document: the new owner's state wins.
 */
export class LeaseLostError extends Error {
  readonly code = 'INGESTION_LEASE_LOST';
}

export interface LeaseUpdate {
  stage?: IngestionStage;
  progress?: IngestionProgress;
}

/** Document registry: files, status, system metadata and the ingestion queue. */
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

  // ------------------------------------------------------- ingestion queue
  /**
   * Moves the document to QUEUED unless a live run owns it. Returns undefined
   * when it is already queued or processing under a valid lease.
   */
  enqueue(
    id: string,
    chunking: ChunkingDescriptor,
  ): Promise<DocumentRecord | undefined>;
  countQueued(): Promise<number>;
  /**
   * Atomically hands the next due document (QUEUED, or PROCESSING with an
   * expired lease) to `runId` (SKIP LOCKED: concurrent workers never get the
   * same row). Increments attempts.
   */
  claimNext(
    runId: string,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<DocumentRecord | undefined>;
  /** Marks FAILED the expired runs that already used every attempt. */
  failAbandoned(maxAttempts: number): Promise<string[]>;
  /** Extends the lease (and records progress). False when the run lost ownership. */
  renewLease(
    id: string,
    runId: string,
    leaseMs: number,
    update?: LeaseUpdate,
  ): Promise<boolean>;
  /** Back to QUEUED after a transient failure, due again after `delayMs`. */
  requeue(
    id: string,
    runId: string,
    error: IngestionError,
    delayMs: number,
  ): Promise<boolean>;
  markFailed(
    id: string,
    runId: string,
    error: IngestionError,
    progress: IngestionProgress,
  ): Promise<boolean>;
  /** Final stage timings, written once the commit (and its own timing) is done. */
  recordCompletedProgress(
    id: string,
    progress: IngestionProgress,
  ): Promise<void>;
  /** Counts what a search over this namespace can and cannot see. */
  coverage(
    namespace: string,
    filters: SearchFilters,
    embeddingVersion: string,
  ): Promise<SearchCoverage>;
}

/** Chunk + vector persistence and candidate search. */
export interface DocumentStorageRepository {
  /**
   * Replaces every chunk of the document and marks it COMPLETED in a single
   * transaction: readers see either the previous version or the new one.
   * Throws LeaseLostError when `runId` no longer owns the document.
   */
  commitIngestion(
    documentId: string,
    runId: string,
    chunks: EmbeddedChunk[],
    completion: IngestionCompletion,
  ): Promise<void>;
  /** Vector candidates, plus full-text candidates when lexicalTerms are given. */
  searchCandidates(query: CandidateSearchQuery): Promise<RetrievedContext[]>;
  listChunks(
    documentId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: StoredChunk[]; total: number }>;
}
