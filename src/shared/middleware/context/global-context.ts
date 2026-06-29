import { AsyncLocalStorage } from 'node:async_hooks';

import type { Request } from 'express';

import { generateRandomString } from '~/shared/helpers/create_random_string';
import { TemporaryContext } from './types/context.types';

const asyncLocalStorage = new AsyncLocalStorage<TemporaryContext>();

export function setTemporaryContext(request: Request): TemporaryContext {
  const context: TemporaryContext = {
    traceId:
      request.header('X-Cloud-Trace-Context')?.split('/')[0] ??
      generateRandomString(32),
    startTime: process.hrtime(),
    httpRequest: {
      remoteIp:
        request.header('x-forwarded-for') ?? request.socket.remoteAddress ?? '',
      referer: request.header('referer'),
      userAgent: request.header('user-agent'),
      domain: request.hostname,
      headers: request.headers as Record<string, string | string[] | undefined>,
    },
  };
  asyncLocalStorage.enterWith(context);
  return context;
}

export function getTemporaryContext(): TemporaryContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getDurationTilNow(): number {
  const diff = process.hrtime(getTemporaryContext()?.startTime);
  return +(diff[0] + diff[1] * 1e-9).toFixed(6);
}
