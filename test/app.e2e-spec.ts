import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import config from '~/config';
import { AppModule } from '~/app.module';
import { configureApp } from '~/app.setup';
import { PgVectorConnectionService } from '~/modules/database/vector/pg-vector-connection.service';
import {
  DOCUMENT_REGISTRY_REPOSITORY,
  DOCUMENT_STORAGE_REPOSITORY,
} from '~/modules/7_storage/application/ports/storage.tokens';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import {
  buildPdf,
  buildSalesWorkbook,
  HANDBOOK_TXT,
  REPORT_PDF_PAGES,
} from './support/fixtures';
import { InMemoryStorage } from './support/in-memory-storage';

/**
 * Full HTTP pipeline with the real parsers, chunker, services and controllers.
 * Only infrastructure is swapped: in-memory vector storage and the offline
 * lexical embedder (the lexical similarity scale is lower than Gemini's, hence
 * the lower min_score).
 */
interface SearchBody {
  found: boolean;
  message: string | null;
  results: {
    content: string;
    score: number;
    citation: string;
    document_id: string;
    metadata: Record<string, any>;
  }[];
  retrieval: Record<string, any>;
}

describe('RAG microservice (e2e)', () => {
  let app: NestExpressApplication;
  let storage: InMemoryStorage;
  const namespace = 'e2e';
  const ids: Record<string, string> = {};

  const http = () => request(app.getHttpServer());
  const search = async (body: Record<string, unknown>) =>
    (
      await http()
        .post('/api/v1/search')
        .send({ namespace, ...body })
        .expect(200)
    ).body as SearchBody;

  const waitForTerminalStatus = async (id: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { body } = await http().get(`/api/v1/documents/${id}`).expect(200);
      if (body.status === 'COMPLETED' || body.status === 'FAILED') return body;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('ingestion did not finish');
  };

  beforeAll(async () => {
    storage = new InMemoryStorage();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PgVectorConnectionService)
      .useValue({ isConfigured: () => true })
      .overrideProvider(DOCUMENT_STORAGE_REPOSITORY)
      .useValue(storage)
      .overrideProvider(DOCUMENT_REGISTRY_REPOSITORY)
      .useValue(storage)
      .overrideProvider(RAG_CONFIG)
      .useValue({
        ...config.rag,
        embedding: { ...config.rag.embedding, provider: 'hashing' },
        search: { ...config.rag.search, minScore: 0.2 },
      })
      .compile();

    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>(),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the server-side ingestion UI', async () => {
    const response = await http().get('/ui').expect(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('/api/v1');
  });

  describe('ingestion', () => {
    it('PDF: upload -> ingest (sync) -> page/section aware chunks', async () => {
      const upload = await http()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .field('source', 'reportes/2025/informe-anual.pdf')
        .field('tags', 'reporte,anual')
        .field('metadata', JSON.stringify({ year: 2025, area: 'corporativo' }))
        .attach(
          'file',
          buildPdf(REPORT_PDF_PAGES, { title: 'Informe anual ACME' }),
          'informe-anual.pdf',
        )
        .expect(201);

      expect(upload.body).toMatchObject({
        duplicate: false,
        document: {
          status: 'PENDING',
          document_type: 'pdf',
          namespace,
          tags: ['reporte', 'anual'],
        },
      });
      ids.pdf = upload.body.document.id;

      const ingest = await http()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ wait: true })
        .expect(200);
      expect(ingest.body.document).toMatchObject({
        status: 'COMPLETED',
        error: null,
        system: {
          parser: { page_count: 3, title: 'Informe anual ACME' },
          chunking: { version: 'chunker-v1', strategy: 'auto' },
          embedding: { version: 'hashing:lexical-hash-v1:768' },
        },
      });
      expect(Object.keys(ingest.body.document.progress.timings_ms)).toEqual(
        expect.arrayContaining([
          'validation',
          'parsing',
          'chunking',
          'embedding',
          'storage',
        ]),
      );

      const chunks = await http()
        .get(`/api/v1/documents/${ids.pdf}/chunks`)
        .expect(200);
      expect(chunks.body.total).toBe(ingest.body.document.chunk_count);
      const security = chunks.body.items.find((chunk: any) =>
        chunk.content.includes('cifrado de disco'),
      );
      expect(security).toMatchObject({
        page_start: 2,
        section: '3. SEGURIDAD DE LA INFORMACIÓN',
      });
      expect(
        chunks.body.items.every(
          (chunk: any) => !chunk.content.includes('Informe confidencial'),
        ),
      ).toBe(true);
    });

    it('XLSX: upload with ingest=true runs in the background and yields table chunks', async () => {
      const upload = await http()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .field('ingest', 'true')
        .attach('file', await buildSalesWorkbook(), 'ventas.xlsx')
        .expect(201);
      ids.xlsx = upload.body.document.id;

      const document = await waitForTerminalStatus(ids.xlsx);
      expect(document).toMatchObject({
        status: 'COMPLETED',
        system: { parser: { sheet_count: 2 } },
      });

      const chunks = (
        await http().get(`/api/v1/documents/${ids.xlsx}/chunks`).expect(200)
      ).body.items;
      expect(
        chunks.map((chunk: any) => [chunk.sheet, chunk.chunk_type]),
      ).toEqual([
        ['Facturación', 'table_summary'],
        ['Facturación', 'table_rows'],
        ['Empleados', 'table_summary'],
        ['Empleados', 'table_rows'],
      ]);
      expect(chunks[1].content).toContain(
        'Row 5: Año: 2025 | Región: Norte | Facturación USD: 1250000',
      );
      expect(chunks[1].metadata).toMatchObject({ row_start: 4, row_end: 6 });
    });

    it('TXT: upload -> ingest -> markdown sections', async () => {
      const upload = await http()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .field('tags', JSON.stringify(['soporte']))
        .attach('file', Buffer.from(HANDBOOK_TXT, 'utf8'), 'manual-soporte.md')
        .expect(201);
      ids.txt = upload.body.document.id;

      const ingest = await http()
        .post(`/api/v1/documents/${ids.txt}/ingest`)
        .send({ wait: true })
        .expect(200);
      expect(ingest.body.document).toMatchObject({
        status: 'COMPLETED',
        system: { parser: { encoding: 'utf-8', markdown: true } },
      });
    });

    it('is idempotent: same file is not duplicated and unchanged documents are not re-embedded', async () => {
      const again = await http()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .attach(
          'file',
          buildPdf(REPORT_PDF_PAGES, { title: 'Informe anual ACME' }),
          'copia.pdf',
        )
        .expect(200);
      expect(again.body).toMatchObject({
        duplicate: true,
        document: { id: ids.pdf },
      });

      const skipped = await http()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ wait: true })
        .expect(200);
      expect(skipped.body).toMatchObject({
        started: false,
        reason: 'already_ingested',
      });

      const before = storage.chunks.filter(
        (chunk) => chunk.documentId === ids.pdf,
      ).length;
      const forced = await http()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ wait: true, force: true })
        .expect(200);
      expect(forced.body.started).toBe(true);
      expect(
        storage.chunks.filter((chunk) => chunk.documentId === ids.pdf),
      ).toHaveLength(before);
    });

    it('records the failing stage and leaves no chunks for a corrupt PDF', async () => {
      const upload = await http()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .attach(
          'file',
          Buffer.from('%PDF-1.4\nthis is not really a pdf'),
          'roto.pdf',
        )
        .expect(201);
      const ingest = await http()
        .post(`/api/v1/documents/${upload.body.document.id}/ingest`)
        .send({ wait: true })
        .expect(200);

      expect(ingest.body.document).toMatchObject({
        status: 'FAILED',
        stage: 'PARSING',
        error: { stage: 'PARSING', code: 'PDF_INVALID' },
        chunk_count: 0,
      });
      expect(
        storage.chunks.some(
          (chunk) => chunk.documentId === upload.body.document.id,
        ),
      ).toBe(false);
    });

    it('keeps the previous version searchable when persistence fails mid re-ingestion', async () => {
      const before = storage.chunks
        .filter((chunk) => chunk.documentId === ids.txt)
        .map((chunk) => chunk.id);
      storage.failNextCommit = new Error('connection reset');

      const ingest = await http()
        .post(`/api/v1/documents/${ids.txt}/ingest`)
        .send({ wait: true, force: true })
        .expect(200);

      expect(ingest.body.document).toMatchObject({
        status: 'FAILED',
        error: { stage: 'STORAGE' },
      });
      expect(
        storage.chunks
          .filter((chunk) => chunk.documentId === ids.txt)
          .map((chunk) => chunk.id),
      ).toEqual(before);

      await http()
        .post(`/api/v1/documents/${ids.txt}/ingest`)
        .send({ wait: true, force: true })
        .expect(200);
    });

    it('validates input at the boundary', async () => {
      await http()
        .post('/api/v1/documents')
        .attach('file', Buffer.from('png'), 'foto.png')
        .expect(415);
      await http()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .expect(400);
      await http()
        .post('/api/v1/documents')
        .field('metadata', 'not json')
        .attach('file', Buffer.from('hola'), 'a.txt')
        .expect(400);
      await http()
        .post('/api/v1/documents/not-a-uuid/ingest')
        .send({})
        .expect(400);
      await http()
        .get('/api/v1/documents/00000000-0000-4000-8000-000000000000')
        .expect(404);
      await http()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ chunking: { chunk_size: 10 } })
        .expect(400);
    });

    it('lists documents by namespace and status', async () => {
      const completed = await http()
        .get('/api/v1/documents')
        .query({ namespace, status: 'COMPLETED' })
        .expect(200);
      expect(completed.body.items.map((item: any) => item.id).sort()).toEqual(
        [ids.pdf, ids.xlsx, ids.txt].sort(),
      );
    });
  });

  describe('retrieval API', () => {
    it('answers a spreadsheet question with the row, sheet and source', async () => {
      const body = await search({
        query: '¿Cuál fue la facturación USD de 2025 en la región Norte?',
        top_k: 3,
      });
      expect(body.found).toBe(true);
      const top = body.results[0];
      expect(top.metadata).toMatchObject({
        document_name: 'ventas.xlsx',
        document_type: 'xlsx',
        sheet: 'Facturación',
        chunk_type: 'table_rows',
        chunk: { row_start: 4, row_end: 6 },
      });
      expect(top.content).toContain('1250000');
      expect(top.citation).toBe(
        'ventas.xlsx, sheet "Facturación", rows 4-6, section "Reporte de facturación anual"',
      );
      expect(body.results.map((result) => result.score)).toEqual(
        [...body.results.map((result) => result.score)].sort((a, b) => b - a),
      );
    });

    it('answers a PDF question with page and section attribution', async () => {
      const body = await search({
        query:
          'cifrado de disco completo en portátiles y autenticación multifactor',
      });
      expect(body.results[0]).toMatchObject({
        document_id: ids.pdf,
        citation:
          'informe-anual.pdf, p. 2, section "3. SEGURIDAD DE LA INFORMACIÓN"',
        metadata: {
          page_start: 2,
          source: 'reportes/2025/informe-anual.pdf',
          tags: ['reporte', 'anual'],
          document: { year: 2025, area: 'corporativo' },
        },
      });
    });

    it('answers a TXT question with the markdown section', async () => {
      const body = await search({
        query: 'incidentes críticos ingeniero de guardia escalamiento',
      });
      expect(body.results[0].metadata).toMatchObject({
        document_name: 'manual-soporte.md',
        section: 'Escalamiento',
      });
    });

    it('applies metadata, type, tag and sheet filters', async () => {
      const onlyPdf = await search({
        query: 'facturación 2025 ingresos',
        filters: { document_types: ['pdf'] },
      });
      expect(
        onlyPdf.results.every(
          (result) => result.metadata.document_type === 'pdf',
        ),
      ).toBe(true);

      const byMetadata = await search({
        query: 'vacaciones empleados',
        filters: { metadata: { year: 2025 } },
      });
      expect(
        byMetadata.results.every((result) => result.document_id === ids.pdf),
      ).toBe(true);

      const byTag = await search({
        query: 'horario mesa de ayuda',
        filters: { tags: ['soporte'] },
      });
      expect(
        byTag.results.every((result) => result.document_id === ids.txt),
      ).toBe(true);

      const bySheet = await search({
        query: 'cargo ciudad nombre',
        filters: { sheets: ['Empleados'] },
      });
      expect(bySheet.found).toBe(true);
      expect(
        bySheet.results.every(
          (result) => result.metadata.sheet === 'Empleados',
        ),
      ).toBe(true);
    });

    it('reports no evidence instead of returning irrelevant chunks', async () => {
      const body = await search({
        query: 'receta tradicional de pastel de chocolate',
        top_k: 5,
      });
      expect(body).toMatchObject({ found: false, results: [] });
      expect(body.message).toContain('No relevant evidence');
    });

    it('isolates namespaces', async () => {
      const body = (
        await http()
          .post('/api/v1/search')
          .send({
            namespace: 'otro-tenant',
            query: 'facturación 2025 región Norte',
            min_score: -1,
          })
          .expect(200)
      ).body as SearchBody;
      expect(body.results).toEqual([]);
    });

    it('validates search requests', async () => {
      await http().post('/api/v1/search').send({}).expect(400);
      await http()
        .post('/api/v1/search')
        .send({ query: 'x', top_k: 0 })
        .expect(400);
      await http()
        .post('/api/v1/search')
        .send({ query: 'x', filters: { unknown: 1 } })
        .expect(400);
    });
  });

  describe('legacy endpoints and deletion', () => {
    it('keeps /ingestion/text and /query/fetch working over the same pipeline', async () => {
      const ingested = await http()
        .post('/api/v1/ingestion/text')
        .send({
          source: 'notas/dia-1',
          content: 'El comité aprobó el presupuesto de tecnología para 2026.',
        })
        .expect(201);
      expect(ingested.body).toMatchObject({
        status: 'COMPLETED',
        namespace: 'default',
        source: 'notas/dia-1',
      });

      const fetched = await http()
        .post('/api/v1/query/fetch')
        .send({ question: 'presupuesto de tecnología aprobado por el comité' })
        .expect(200);
      expect(fetched.body[0]).toMatchObject({
        metadata: { source: 'notas/dia-1' },
      });
    });

    it('deletes a document and its chunks', async () => {
      await http().delete(`/api/v1/documents/${ids.txt}`).expect(204);
      await http().get(`/api/v1/documents/${ids.txt}`).expect(404);
      expect(storage.chunks.some((chunk) => chunk.documentId === ids.txt)).toBe(
        false,
      );

      const body = await search({
        query: 'incidentes críticos ingeniero de guardia escalamiento',
      });
      expect(
        body.results.every((result) => result.document_id !== ids.txt),
      ).toBe(true);
    });
  });
});
