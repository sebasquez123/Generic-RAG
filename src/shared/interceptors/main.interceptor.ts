import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Level } from 'pino';
import type { Observable } from 'rxjs';
import { throwError } from 'rxjs';
import { catchError, tap, timeout } from 'rxjs/operators';

import { LoggerService } from '~/shared/logging/main.logger';
import {
  getTemporaryContext,
  setTemporaryContext,
  getDurationTilNow,
} from '~/shared/middleware/context/global-context';

const excludedEndpoints = new Set(['/startup-probe', '/liveness-probe']);

const logger = new LoggerService('LoggingInterceptor');

interface reqParams {
  method: string;
  url: string;
  route: string;
  remoteIp: string;
  domain?: string;
}

const requestStartingLogTemplate = (
  reqParams: reqParams,
  duration: number,
): string => {
  return `Request processing\n From:\n IP: ${reqParams.remoteIp}\n Domain:${reqParams.domain ?? 'Unknown'}\n Server:\n Method: ${reqParams.method}\n URL: ${reqParams.url}\n Route: ${reqParams.route}\n Duration: ${duration} seconds`;
};
const requestFinalLogTemplate = (duration: number): string => {
  return `Request finished\n Duration: ${duration} seconds `;
};
const requestErrorLogTemplate = (
  reqParams: reqParams,
  duration: number,
  error: unknown,
): string => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return `Request error\n From:\n IP: ${reqParams.remoteIp}\n Domain:${reqParams.domain ?? 'Unknown'}\n Server:\n Method: ${reqParams.method}\n URL: ${reqParams.url}\n Route: ${reqParams.route}\n Duration: ${duration} seconds\n Error details: ${message}`;
};
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const parameters: reqParams = {
      method: '',
      url: '',
      route: '',
      remoteIp: '',
      domain: '',
    };

    const request = context.switchToHttp().getRequest<Request>();
    if (excludedEndpoints.has(request.url)) return next.handle();

    let localStorageContext = getTemporaryContext();
    const response = context.switchToHttp().getResponse<Response>();

    if (!localStorageContext) {
      localStorageContext = setTemporaryContext(request);
      response.set('X-Request-Id', localStorageContext.traceId);
    }

    const handler = context.getHandler();
    const controller = context.getClass();

    const route = `${controller.name}.${handler.name}`;
    localStorageContext.route = route;

    parameters['method'] = request.method;
    parameters['url'] = request.url;
    parameters['route'] = route;
    parameters['remoteIp'] = localStorageContext.httpRequest.remoteIp;
    parameters['domain'] = localStorageContext.httpRequest.domain;

    logger.debug(requestStartingLogTemplate(parameters, getDurationTilNow()));

    return next.handle().pipe(
      tap(() => {
        logger.debug(requestFinalLogTemplate(getDurationTilNow()));
      }),
      timeout(30000),
      catchError((error: unknown) => {
        logger.error(
          requestErrorLogTemplate(parameters, getDurationTilNow(), error),
        );
        return throwError(() => error);
      }),
    );
  }
}
