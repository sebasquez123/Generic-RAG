import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface LineupResponse {
  activeModelAdapters: string[];
  memoryModule: string;
  graphModule: string;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1/rag/lineup (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/rag/lineup')
      .expect(200)
      .expect((response) => {
        const body = response.body as LineupResponse;

        expect(body.activeModelAdapters).toEqual(['gpt']);
        expect(body.memoryModule).toBe('vector-memory/postgres-pgvector');
        expect(body.graphModule).toBe('langgraph/langchain');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
