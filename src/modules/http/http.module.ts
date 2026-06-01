import { HttpModule as NestHttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { HttpClientService } from './http-client.service';

@Module({
  imports: [
    NestHttpModule.register({
      timeout: 10_000,
      maxRedirects: 5,
    }),
  ],
  providers: [HttpClientService],
  exports: [HttpClientService, NestHttpModule],
})
export class HttpModule {}
