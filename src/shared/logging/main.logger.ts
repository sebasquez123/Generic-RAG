import type { LoggerService as LoggerServiceInterface } from '@nestjs/common';
import { logger } from './config';

// Pino expects `(mergingObject, message)`. Passing the message as a second
// positional argument silently drops it, so every call normalises to that shape.
export class LoggerService implements LoggerServiceInterface {
  constructor(private readonly context: string) {}

  error(error: unknown, trace?: string) {
    if (error instanceof Error) {
      logger.error({ context: this.context, err: error, trace }, error.message);
    } else if (typeof error === 'object' && error !== null) {
      logger.error({ context: this.context, details: error }, trace ?? 'error');
    } else {
      logger.error({ context: this.context, trace }, String(error));
    }
  }

  warn(message: string) {
    logger.warn({ context: this.context }, message);
  }

  log(message: string) {
    logger.info({ context: this.context }, message);
  }

  debug(message: string) {
    logger.debug({ context: this.context }, message);
  }

  verbose(message: string) {
    logger.trace({ context: this.context }, message);
  }

  /** Structured event log: fields stay queryable instead of being interpolated. */
  event(message: string, fields: Record<string, unknown>) {
    logger.info({ context: this.context, ...fields }, message);
  }

  eventError(message: string, fields: Record<string, unknown>) {
    logger.error({ context: this.context, ...fields }, message);
  }
}
