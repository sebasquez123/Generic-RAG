/**
 * Cross-module contracts of the ingestion -> retrieval pipeline.
 *
 * Metadata is split in three layers so nothing is duplicated inside chunk text:
 * - document metadata: caller-provided facts about the whole file (`metadata`, `tags`).
 * - chunk metadata:    where a retrievable piece lives (page, section, sheet, rows).
 * - system metadata:   how the document was processed (hash, parser info,
 *                      chunking and embedding versions, status, errors).
 */

export enum DocumentType {
  Pdf = 'pdf',
  Xlsx = 'xlsx',
  Txt = 'txt',
  Json = 'json',
}

export enum IngestionStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

export enum IngestionStage {
  Validation = 'VALIDATION',
  Parsing = 'PARSING',
  Chunking = 'CHUNKING',
  Embedding = 'EMBEDDING',
  Storage = 'STORAGE',
}

export enum ChunkType {
  Text = 'text',
  TableRows = 'table_rows',
  TableSummary = 'table_summary',
}

export enum ChunkingStrategy {
  /** Picks `recursive` for prose blocks and `table` for tabular blocks. */
  Auto = 'auto',
  Recursive = 'recursive',
  Table = 'table',
}

// ---------------------------------------------------------------- parsing

export interface ParsedHeadingBlock {
  kind: 'heading';
  text: string;
  level: number;
  page?: number;
}

export interface ParsedTextBlock {
  kind: 'text';
  text: string;
  page?: number;
}

export interface ParsedTableRow {
  /** 1-based row number in the original sheet/array. */
  rowNumber: number;
  cells: string[];
}

export interface ParsedTableBlock {
  kind: 'table';
  sheet?: string;
  tableIndex: number;
  /** Title-like line found right above the table (e.g. "Sales 2025"). */
  caption?: string;
  headers: string[];
  /** Whether headers came from the file or were synthesised (Column A...). */
  headerSource: 'detected' | 'generated';
  rows: ParsedTableRow[];
}

export type ParsedBlock =
  | ParsedHeadingBlock
  | ParsedTextBlock
  | ParsedTableBlock;

export interface ParsedDocument {
  type: DocumentType;
  title?: string;
  blocks: ParsedBlock[];
  /** System metadata produced by the parser (page count, encoding, sheets...). */
  info: Record<string, unknown>;
  warnings: string[];
}

// --------------------------------------------------------------- chunking

export interface ChunkingOptions {
  strategy: ChunkingStrategy;
  chunkSize: number;
  chunkOverlap: number;
  minChunkChars: number;
  tableMaxRowsPerChunk: number;
}

export interface ChunkingDescriptor extends ChunkingOptions {
  version: string;
}

export interface ChunkDraft {
  chunkIndex: number;
  chunkType: ChunkType;
  /** Original text, stored as-is so it can be quoted and cited. */
  content: string;
  contentHash: string;
  pageStart?: number;
  pageEnd?: number;
  section?: string;
  sheet?: string;
  metadata: Record<string, unknown>;
}

// -------------------------------------------------------------- embedding

export interface EmbeddingDescriptor {
  provider: string;
  model: string;
  dimensions: number;
  /** Identifies the vector space. Chunks from other versions are never mixed. */
  version: string;
}

export interface EmbeddedChunk extends ChunkDraft {
  embedding: number[];
}

// -------------------------------------------------------------- documents

export interface IngestionError {
  stage: IngestionStage;
  code: string;
  message: string;
  at: string;
}

export interface IngestionProgress {
  stage?: IngestionStage;
  chunksTotal?: number;
  chunksEmbedded?: number;
  timingsMs?: Partial<Record<Lowercase<IngestionStage>, number>>;
}

export interface DocumentRecord {
  id: string;
  namespace: string;
  name: string;
  documentType: DocumentType;
  source: string;
  mimeType?: string;
  sizeBytes: number;
  contentHash: string;
  metadata: Record<string, unknown>;
  tags: string[];
  status: IngestionStatus;
  stage?: IngestionStage;
  progress: IngestionProgress;
  error?: IngestionError;
  chunkCount: number;
  parserInfo: Record<string, unknown>;
  chunking?: ChunkingDescriptor;
  embedding?: EmbeddingDescriptor;
  ingestionStartedAt?: Date;
  ingestedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewDocument {
  id: string;
  namespace: string;
  name: string;
  documentType: DocumentType;
  source: string;
  mimeType?: string;
  sizeBytes: number;
  contentHash: string;
  fileContent: Buffer;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface DocumentListQuery {
  namespace?: string;
  status?: IngestionStatus;
  limit: number;
  offset: number;
}

export interface IngestionCompletion {
  parserInfo: Record<string, unknown>;
  chunking: ChunkingDescriptor;
  embedding: EmbeddingDescriptor;
  progress: IngestionProgress;
}

export interface StoredChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  chunkType: ChunkType;
  content: string;
  pageStart?: number;
  pageEnd?: number;
  section?: string;
  sheet?: string;
  metadata: Record<string, unknown>;
  embeddingVersion: string;
  createdAt: Date;
}

// -------------------------------------------------------------- retrieval

export interface SearchFilters {
  documentIds?: string[];
  documentTypes?: DocumentType[];
  sources?: string[];
  tags?: string[];
  sheets?: string[];
  /** JSON containment match against document metadata. */
  metadata?: Record<string, unknown>;
}

export interface VectorSearchQuery {
  embedding: number[];
  embeddingVersion: string;
  namespace: string;
  filters: SearchFilters;
  limit: number;
}

export interface RetrievedContext {
  chunkId: string;
  documentId: string;
  documentName: string;
  documentType: DocumentType;
  source: string;
  tags: string[];
  documentMetadata: Record<string, unknown>;
  chunkIndex: number;
  chunkType: ChunkType;
  content: string;
  contentHash: string;
  pageStart?: number;
  pageEnd?: number;
  section?: string;
  sheet?: string;
  chunkMetadata: Record<string, unknown>;
  createdAt: Date;
  /** Cosine similarity in [−1, 1]; higher is closer. */
  score: number;
}
