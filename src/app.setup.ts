import { RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** HTTP setup shared by main.ts and the e2e suite. */
export function configureApp(
  app: NestExpressApplication,
): NestExpressApplication {
  app.disable('x-powered-by');
  // Legacy /ingestion/text and /ingestion/structured carry content in JSON.
  app.useBodyParser('json', { limit: '10mb' });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'ui', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });
  return app;
}
