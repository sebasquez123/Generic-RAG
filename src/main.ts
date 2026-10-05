import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { LoggerService } from './shared/logging/main.logger';
import config from './config';

const logger = new LoggerService('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new LoggerService('Bootstrap'),
    cors: true,
    rawBody: true,
  });

  configureApp(app);
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GenRag API')
    .setDescription(
      'Document ingestion (PDF/XLSX/TXT/JSON) and semantic retrieval',
    )
    .setVersion(config.app.version)
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('client-api/swagger', app, document, {});

  await app.listen(config.app.port ?? 3000);

  logger.debug(`Listening on ${config.app.port} PORT (UI at /ui)`);
}
void bootstrap();
