import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface LineupResponse {
  ingestionModule: string;
  embeddingModule: string;
  storageModule: string;
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

  it('/api/v1/ingestion/lineup (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/ingestion/lineup')
      .expect(200)
      .expect((response) => {
        const body = response.body as LineupResponse;

        expect(body.ingestionModule).toBe('ingestion/text-and-pdf');
        expect(body.embeddingModule).toBe('embedding/text-to-vector');
        expect(body.storageModule).toBe('storage/postgres-pgvector');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
