enum EmbeddingErrorCodes {
  PROVIDER_REQUEST_FAILED = 'EMBEDDING_PROVIDER_REQUEST_FAILED',
  INVALID_PROVIDER_RESPONSE = 'EMBEDDING_INVALID_PROVIDER_RESPONSE',
  EMPTY_INPUT = 'EMBEDDING_EMPTY_INPUT',
  PROVIDER_NOT_CONFIGURED = 'EMBEDDING_PROVIDER_NOT_CONFIGURED',
}

export class EmbeddingProviderError extends Error {
  public readonly code = EmbeddingErrorCodes.PROVIDER_REQUEST_FAILED;
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export class InvalidEmbeddingResponseError extends Error {
  public readonly code = EmbeddingErrorCodes.INVALID_PROVIDER_RESPONSE;
}

export class EmptyEmbeddingInputError extends Error {
  public readonly code = EmbeddingErrorCodes.EMPTY_INPUT;
}

export class EmbeddingProviderNotConfiguredError extends Error {
  public readonly code = EmbeddingErrorCodes.PROVIDER_NOT_CONFIGURED;
}
