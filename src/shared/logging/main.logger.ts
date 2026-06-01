import type { LoggerService as LoggerServiceInterface } from '@nestjs/common';
import type { BaseLogger, Level, LoggerOptions } from 'pino';
import Pino, { destination, stdSerializers } from 'pino';

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
      timestamp: requestContext?.startTime
    };
  },
};

const stdout = Pino(localOptions);

const logger: Pick<BaseLogger, Level> = {
  trace: stdout.trace.bind(stdout),
  debug: stdout.debug.bind(stdout),
  info: stdout.info.bind(stdout),
  warn: stdout.warn.bind(stdout),
  error: stdout.error.bind(stdout),
  fatal: stdout.fatal.bind(stdout) ,
};

export class LoggerService implements LoggerServiceInterface {

  constructor(private readonly context: string) {}

  error(error: unknown, trace?: string) {
    logger.error(`[${this.context ?? 'unknown context'}]: `,{ error, trace });
  }

  warn(message: string) {
    logger.warn(`[${this.context ?? 'unknown context'}]: `, message);
  }

  log(message: string) {
    logger.trace(`[${this.context ?? 'unknown context'}]: `, message);
  }

  debug(message: string) {
    logger.debug(`[${this.context ?? 'unknown context'}]: `, message);
  }

  verbose(message: string) {
    logger.trace(`[${this.context ?? 'unknown context'}]: `, message);
  }
}
