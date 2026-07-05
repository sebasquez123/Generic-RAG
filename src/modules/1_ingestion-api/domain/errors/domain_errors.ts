
enum DomainErrorCodes {
  PDF_NO_FORMATTED = 'PDF_NO_FORMATTED',
  CUSTOM_JSON_NO_FORMATTED = 'CUSTOM_JSON_NO_FORMATTED',
  TEXT_NO_FORMATTED = 'TEXT_NO_FORMATTED',
}

export class PDFNoFormattedError extends Error {
  public readonly code: string;
  constructor(
    message: string,
    public readonly source?: string,
    public readonly agent?: string,
    public readonly task?: string,
  ) {
    super(message);
    this.code = DomainErrorCodes.PDF_NO_FORMATTED;
  }
}

export class CustomJsonNoFormattedError extends Error {
  public readonly code: string;
  constructor(
    message: string,
    public readonly source?: string,
    public readonly agent?: string,
    public readonly task?: string,
  ) {
    super(message);
    this.code = DomainErrorCodes.CUSTOM_JSON_NO_FORMATTED;
  }
}

export class TextNoFormattedError extends Error {
  public readonly code: string;
  constructor(
    message: string,
    public readonly source?: string,
    public readonly agent?: string,
    public readonly task?: string,
  ) {
    super(message);
    this.code = DomainErrorCodes.TEXT_NO_FORMATTED;
  }
}
