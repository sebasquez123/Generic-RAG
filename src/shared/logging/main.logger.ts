import type { LoggerService as LoggerServiceInterface } from '@nestjs/common';
import  { logger } from './config';

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
