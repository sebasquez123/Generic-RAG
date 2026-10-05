import type { BaseLogger, Level, LoggerOptions } from 'pino';
import Pino, { stdSerializers } from 'pino';

import config from '~/config';
import { getTemporaryContext } from '~/shared/middleware/context/global-context';

/**
 * Second line of defence: request headers are never put in the log context,
 * but any field with one of these names is censored wherever it appears.
 */
export const REDACTED_PATHS = [
  'authorization',
  'cookie',
  'password',
  'apiKey',
  'api_key',
  'key',
  'token',
  '["x-api-key"]',
  '["x-goog-api-key"]',
  '*.authorization',
  '*.cookie',
  '*.password',
  '*.apiKey',
  '*.api_key',
  '*.key',
  '*.token',
  '*["x-api-key"]',
  '*["x-goog-api-key"]',
  '*.headers',
  'headers',
];

export function buildLoggerOptions(pretty: boolean): LoggerOptions {
  return {
    level: config.log.level,
    // Pretty output is for humans on a laptop; production gets one JSON object per line.
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            levelFirst: true,
            ignore: 'serviceContext',
            translateTime: 'SYS:HH:MM:ss.l',
          },
        }
      : undefined,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
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
        principal: requestContext?.principal,
      };
    },
  };
}

const stdout = Pino(buildLoggerOptions(config.app.isDev));

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
