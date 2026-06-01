import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { LoggerService } from './shared/logging/main.logger';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { SwaggerModule } from 'node_modules/@nestjs/swagger/dist/swagger-module';
import config from './config';
import { DocumentBuilder } from 'node_modules/@nestjs/swagger/dist/document-builder';

const logger = new LoggerService('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new LoggerService('Bootstrap'),
    cors: true as CorsOptions | boolean,
    rawBody: true,
  });

  app.disable('x-powered-by');
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder().setTitle('Fieldhouse REST API').setVersion(config.app.version).build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('client-api/swagger', app, document, {});

  app.setGlobalPrefix('genrag//v1');

  await app.listen(config.app.port?? 3000);
  
  logger.debug(`Listening on ${config.app.port} PORT`);
}
void bootstrap();
