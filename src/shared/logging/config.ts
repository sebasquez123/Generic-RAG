import type { LoggerService as LoggerServiceInterface } from '@nestjs/common';
import type { BaseLogger, Level, LoggerOptions } from 'pino';
import Pino, { stdSerializers } from 'pino';

import config from '~/config';
import { getTemporaryContext } from '~/shared/middleware/context/global-context';

const localOptions: LoggerOptions = {
  level: config.log.level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      levelFirst: true,
      ignore: 'serviceContext',
      translateTime: 'SYS:HH:MM:ss.l',
    },
  },
  serializers: {
    err: stdSerializers.errWithCause,
    error: stdSerializers.errWithCause,
    exception: stdSerializers.errWithCause,
  },
  mixin: () => {
    const requestContext = getTemporaryContext();
    return {
      httpRequest: requestContext?.httpRequest,
      traceId: requestContext?.traceId,
      route: requestContext?.route,
      timestamp: requestContext?.startTime,
    };
  },
};

const stdout = Pino(localOptions);

export const logger: Pick<BaseLogger, Level> = {
  trace: stdout.trace.bind(stdout),
  debug: stdout.debug.bind(stdout),
  info: stdout.info.bind(stdout),
  warn: stdout.warn.bind(stdout),
  error: stdout.error.bind(stdout),
  fatal: stdout.fatal.bind(stdout),
};

export enum DbLogLimits {
  NewDbQuery = 'New DB query',
  QueryDeadline = 'Query deadline',
}

export interface PGLogger {
  logQueryLimits(
    edgepoint: DbLogLimits,
    query: string,
    parameters?: unknown[],
  ): void;
  logVectorSearch(
    query: string,
    vector: number[],
    limit: number,
    similarity: 'cosine' | 'euclidean' | 'inner',
  ): void;
  logVectorDimensionMismatch(
    expected: number,
    actual: number,
    embedding: string,
  ): void;
  logBatchEmbeddingInsert(
    count: number,
    totalDimensions: number,
    query: string,
  ): void;
  logSlowVectorOperation(
    time: number,
    query: string,
    operationType: 'search' | 'insert' | 'index',
  ): void;
  logEmbeddingRetrieval(
    count: number,
    threshold?: number,
    query?: string,
  ): void;
  logUnexpectedQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
  ): void;
  logVectorOperationError(
    error: Error,
    operationType: 'search' | 'insert' | 'index',
    query: string,
    vector?: number[],
  ): void;
}
