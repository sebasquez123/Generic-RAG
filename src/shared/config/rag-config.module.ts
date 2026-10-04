import { Global, Module } from '@nestjs/common';
import config from '~/config';

export const RAG_CONFIG = Symbol('RAG_CONFIG');

/** Exposes `config.rag` through DI so tests can override tuning values. */
@Global()
@Module({
  providers: [{ provide: RAG_CONFIG, useValue: config.rag }],
  exports: [RAG_CONFIG],
})
export class RagConfigModule {}
