enum DomainErrorCodes {
  INVALID_CHUNKING_OPTIONS = 'INVALID_CHUNKING_OPTIONS',
}

export class InvalidChunkingOptionsError extends Error {
  public readonly code = DomainErrorCodes.INVALID_CHUNKING_OPTIONS;
}
