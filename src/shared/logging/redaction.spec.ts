import { Writable } from 'node:stream';
import type { Request } from 'express';
import Pino from 'pino';
import { setTemporaryContext } from '../middleware/context/global-context';
import { buildLoggerOptions } from './config';

describe('log redaction', () => {
  const capture = () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = Pino(
      { ...buildLoggerOptions(false), level: 'info' },
      stream,
    );
    return { logger, output: () => lines.join('') };
  };

  it('never keeps request headers in the log context', () => {
    const request = {
      header: (name: string) =>
        ({ authorization: 'Bearer secret-token', 'user-agent': 'agent/1.0' })[
          name.toLowerCase()
        ],
      headers: { authorization: 'Bearer secret-token', cookie: 'sid=abc' },
      socket: { remoteAddress: '10.0.0.1' },
      hostname: 'genrag.local',
    } as unknown as Request;

    const context = setTemporaryContext(request);
    expect(JSON.stringify(context)).not.toContain('secret-token');
    expect(JSON.stringify(context)).not.toContain('sid=abc');

    const { logger, output } = capture();
    logger.info({ note: 'request' }, 'handled');
    expect(output()).toContain('agent/1.0');
    expect(output()).not.toContain('secret-token');
  });

  it('censors sensitive fields wherever a caller logs them', () => {
    const { logger, output } = capture();
    logger.info(
      {
        authorization: 'Bearer leaked',
        apiKey: 'leaked-key',
        request: { headers: { 'x-api-key': 'leaked-header' }, password: 'pw' },
      },
      'careless log',
    );
    const text = output();
    for (const secret of ['leaked', 'leaked-key', 'leaked-header', '"pw"'])
      expect(text).not.toContain(secret);
    expect(text).toContain('[REDACTED]');
  });
});
