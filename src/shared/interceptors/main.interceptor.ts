import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { GqlContextType } from '@nestjs/graphql';
import { GqlArgumentsHost } from '@nestjs/graphql';
import type { Request, Response } from 'express';
import type { GraphQLResolveInfo } from 'graphql';
import { GraphQLError } from 'graphql/error';
import type { Level } from 'pino';
import type { Observable } from 'rxjs';
import { throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import logger from '~/logger';
import { getAsyncLocalStorageContext, getDurationFromStart, setAsyncLocalStorageContextForHttpRequest } from '~/shared/async-local-storage-context';

const notLogEndpoints = new Set(['/startup-probe', '/liveness-probe']);

export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const type = context.getType<GqlContextType>();
    const parameters: Record<string, unknown> = { type };

    if (type === 'http') {
      const request = context.switchToHttp().getRequest<Request>();
      if (notLogEndpoints.has(request.url)) return next.handle();

      let localStorageContext = getAsyncLocalStorageContext();
      if (!localStorageContext) {
        localStorageContext = setAsyncLocalStorageContextForHttpRequest(request);
      }
      const response = context.switchToHttp().getResponse<Response>();
      response.set('X-Request-Id', localStorageContext.traceId);

      const handler = context.getHandler();
      const controller = context.getClass();
      const route = `${controller.name}.${handler.name}`;
      localStorageContext.route = route;

      parameters['method'] = request.method;
      parameters['url'] = request.url;
      parameters['route'] = route;
    }

    if (type === 'graphql') {
      const gqlHost = GqlArgumentsHost.create(context);

      const info = gqlHost.getInfo<GraphQLResolveInfo>();
      parameters['type'] = info.parentType;
      parameters['field'] = info.fieldName;
      parameters['variables'] = info.variableValues;
    }
    logger.debug(parameters, `Request processing started`);
    return next.handle().pipe(
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (error instanceof HttpException) {
          const status = error.getStatus();
          const level: Level = 500 <= status && status <= 599 ? 'error' : 'debug';
          logger[level]({ ...parameters, duration: getDurationFromStart(), error }, message);
          return throwError(() => error);
        }
        if (error instanceof GraphQLError) {
          logger.debug({ ...parameters, duration: getDurationFromStart(), error }, message);
          return throwError(() => error);
        }
        logger.error({ ...parameters, duration: getDurationFromStart(), error }, message);
        return throwError(() => error);
      }),
      tap(() => {
        logger.debug({ ...parameters, duration: getDurationFromStart() }, `Request finished`);
      })
    );
  }
}
