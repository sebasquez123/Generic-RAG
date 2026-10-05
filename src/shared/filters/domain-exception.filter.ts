import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { LoggerService } from '~/shared/logging/main.logger';

/**
 * Maps domain error codes to HTTP statuses so domain/application layers never
 * import HTTP exceptions. Unknown errors become a 500 without internals.
 */
const STATUS_BY_CODE: Record<string, HttpStatus> = {
  UNSUPPORTED_DOCUMENT_TYPE: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  INVALID_DOCUMENT: HttpStatus.BAD_REQUEST,
  INVALID_CHUNKING_OPTIONS: HttpStatus.BAD_REQUEST,
  DOCUMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  DOCUMENT_BUSY: HttpStatus.CONFLICT,
  NAMESPACE_FORBIDDEN: HttpStatus.FORBIDDEN,
  NAMESPACE_REQUIRED: HttpStatus.BAD_REQUEST,
  INGESTION_QUEUE_FULL: HttpStatus.TOO_MANY_REQUESTS,
  SEARCH_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  EMBEDDING_EMPTY_INPUT: HttpStatus.BAD_REQUEST,
  EMBEDDING_PROVIDER_REQUEST_FAILED: HttpStatus.BAD_GATEWAY,
  EMBEDDING_PROVIDER_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  EMBEDDING_INVALID_PROVIDER_RESPONSE: HttpStatus.BAD_GATEWAY,
};

const logger = new LoggerService('DomainExceptionFilter');

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException)
      return response
        .status(exception.getStatus())
        .json(exception.getResponse());

    const code = (exception as { code?: unknown })?.code;
    const status = typeof code === 'string' ? STATUS_BY_CODE[code] : undefined;
    if (status)
      return response.status(status).json({
        statusCode: status,
        code,
        message: (exception as Error).message,
        // Lets agents tell "try again later" apart from "fix the request".
        retryable:
          status === HttpStatus.TOO_MANY_REQUESTS ||
          status === HttpStatus.SERVICE_UNAVAILABLE,
      });

    logger.error(exception, 'Unhandled error');
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
