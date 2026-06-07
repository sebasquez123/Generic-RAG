import { 
  HttpException,
  HttpExceptionOptions, 
  NotFoundException,  
  NotImplementedException, 
  InternalServerErrorException, 
  PreconditionFailedException,
  BadGatewayException,
  BadRequestException } from '@nestjs/common';

export enum ErrorReasonEnum {
  FORBIDDEN = 'FORBIDDEN',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',
  BAD_REQUEST = 'BAD_REQUEST',
  GATEWAY_ERROR = 'GATEWAY_ERROR',
}

export class NotFoundError extends NotFoundException {
  constructor(message: string,dependency: string, options?: HttpExceptionOptions) {
    options = options ?? {};
    options.cause = ErrorReasonEnum.NOT_FOUND;
    if (dependency) options.description = `Error aligned with ${dependency}`;
    super(message, options);
  }
}

export class NotImplementedError extends NotImplementedException {
  constructor(message: string, dependency?: string, options?: HttpExceptionOptions) {
    options = options ?? {};
    options.cause = ErrorReasonEnum.NOT_IMPLEMENTED;
    if (dependency) options.description = `Error aligned with ${dependency}`;
    super(message, options);
  }
}

export class InternalServerError extends InternalServerErrorException {
  constructor(message: string, dependency?: string, options?: HttpExceptionOptions) {
    options = options ?? {};
    options.cause = ErrorReasonEnum.INTERNAL_SERVER_ERROR;
    if (dependency) options.description = `Error aligned with ${dependency}`;
    super(message, options);
  }
}

export class PreconditionFailedError extends PreconditionFailedException {
  constructor(message: string, dependency?: string, options?: HttpExceptionOptions) {
    options = options ?? {};
    options.cause = ErrorReasonEnum.PRECONDITION_FAILED;
    if (dependency) options.description = `Error aligned with ${dependency}`;
    super(message, options);
  }
}
export class BadGatewayError extends BadGatewayException {
  constructor(message: string, dependency?: string, options?: HttpExceptionOptions) {
    options = options ?? {};
    options.cause = ErrorReasonEnum.GATEWAY_ERROR;
    if (dependency) options.description = `Error aligned with ${dependency}`;
    super(message, options);
  }
}

export class BadRequestError extends BadRequestException {
  constructor(message: string,dependency?: string, options?: HttpExceptionOptions) {
    options = options ?? {};
    options.cause = ErrorReasonEnum.BAD_REQUEST;
    if (dependency) options.description = `Error aligned with ${dependency}`;
    super(message, options);
  }
}
