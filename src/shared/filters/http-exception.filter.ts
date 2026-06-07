import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { HttpArgumentsHost } from '@nestjs/common/interfaces';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const context = host.getType();
    if (context === 'http') return this.catchHttp(exception, host.switchToHttp());
    throw new Error(`Unknown context type: ${context}`);
  }

  private catchHttp(error: Error, context: HttpArgumentsHost) {
    const response = context.getResponse<Response>();

    if (error instanceof HttpException) {
      return response.status(error.getStatus()).json(error.getResponse());
    }

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: error.message || 'Internal server error',
    });
  }
}
