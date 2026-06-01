import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { HttpArgumentsHost } from '@nestjs/common/interfaces';
import type { GqlContextType, GqlExceptionFilter } from '@nestjs/graphql';
import { GqlArgumentsHost } from '@nestjs/graphql';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter, GqlExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const context = host.getType<GqlContextType>();
    if (context === 'http') return this.catchHttp(exception, host.switchToHttp());
    if (context === 'graphql') return this.catchGraphql(exception, GqlArgumentsHost.create(host));
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

  private catchGraphql(error: Error, _context: GqlArgumentsHost) {
    return error;
  }
}
