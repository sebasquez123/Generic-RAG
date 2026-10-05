import { IngestionStage } from '~/shared/types/semantic-pipeline.type';

export enum DomainErrorCodes {
  UNSUPPORTED_DOCUMENT_TYPE = 'UNSUPPORTED_DOCUMENT_TYPE',
  INVALID_DOCUMENT = 'INVALID_DOCUMENT',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  DOCUMENT_BUSY = 'DOCUMENT_BUSY',
  INGESTION_QUEUE_FULL = 'INGESTION_QUEUE_FULL',
  PDF_NO_TEXT = 'PDF_NO_TEXT',
  PDF_ENCRYPTED = 'PDF_ENCRYPTED',
  PDF_INVALID = 'PDF_INVALID',
  XLSX_INVALID = 'XLSX_INVALID',
  XLSX_EMPTY = 'XLSX_EMPTY',
  XLSX_TOO_LARGE = 'XLSX_TOO_LARGE',
  PDF_TOO_LARGE = 'PDF_TOO_LARGE',
  TEXT_EMPTY = 'TEXT_EMPTY',
  JSON_INVALID = 'JSON_INVALID',
  NO_CHUNKS = 'NO_CHUNKS',
  TOO_MANY_CHUNKS = 'TOO_MANY_CHUNKS',
  STAGE_FAILED = 'STAGE_FAILED',
}

/** Rejected before any processing: wrong type, empty, too large, corrupt magic bytes. */
export class UnsupportedDocumentTypeError extends Error {
  public readonly code = DomainErrorCodes.UNSUPPORTED_DOCUMENT_TYPE;
}

export class InvalidDocumentError extends Error {
  public readonly code = DomainErrorCodes.INVALID_DOCUMENT;
}

export class DocumentNotFoundError extends Error {
  public readonly code = DomainErrorCodes.DOCUMENT_NOT_FOUND;
  constructor(public readonly documentId: string) {
    super(`Document ${documentId} not found`);
  }
}

export class DocumentBusyError extends Error {
  public readonly code = DomainErrorCodes.DOCUMENT_BUSY;
}

/** Backpressure: too many documents waiting for a worker. Retryable (429). */
export class IngestionQueueFullError extends Error {
  public readonly code = DomainErrorCodes.INGESTION_QUEUE_FULL;
}

/** Content-level failure raised by a parser (the file is valid but unusable). */
export class DocumentParsingError extends Error {
  constructor(
    public readonly code: DomainErrorCodes,
    message: string,
  ) {
    super(message);
  }
}

export class ChunkingOutcomeError extends Error {
  constructor(
    public readonly code: DomainErrorCodes,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps any failure with the pipeline stage where it happened. */
export class IngestionStageError extends Error {
  public readonly code: string;
  constructor(
    public readonly stage: IngestionStage,
    cause: unknown,
  ) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`[${stage}] ${message}`, { cause });
    const code = (cause as { code?: unknown })?.code;
    this.code = typeof code === 'string' ? code : DomainErrorCodes.STAGE_FAILED;
  }
}
