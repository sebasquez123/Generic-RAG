import { CHUNKING_VERSION } from '~/modules/2_chunker/application/chunking.service';
import { PgVectorDocumentRepository } from '~/modules/7_storage/adapters/postgres/pgvector-document.repository';
import {
  buildPdf,
  buildSalesWorkbook,
  HANDBOOK_TXT,
  REPORT_PDF_PAGES,
} from './support/fixtures';
import {
  createTestApp,
  TEST_KEYS,
  waitForTerminal,
  type TestApp,
} from './support/test-app';

/**
 * Full HTTP pipeline: real guard, controllers, parsers, chunker, queue worker
 * and repository SQL on PGlite (PostgreSQL + pgvector). Only the embedder is
 * the offline lexical one (its similarity scale is lower than Gemini's, hence
 * the lower min_score).
 */
interface SearchBody {
  found: boolean;
  verdict: { status: string; reasons: string[] };
  message: string | null;
  coverage: Record<string, any>;
  content_is_untrusted: boolean;
  results: {
    rank: number;
    content: string;
    score: number;
    citation: string;
    document_id: string;
    signals: Record<string, any>;
    source: Record<string, any>;
    metadata: Record<string, any>;
  }[];
  retrieval: Record<string, any>;
}

describe('RAG microservice (e2e)', () => {
  let t: TestApp;
  const namespace = 'e2e';
  const ids: Record<string, string> = {};

  const as = (key: string) => ({
    get: (url: string) => t.http().get(url).set('x-api-key', key),
    post: (url: string) => t.http().post(url).set('x-api-key', key),
    delete: (url: string) => t.http().delete(url).set('x-api-key', key),
  });
  const a = () => as(TEST_KEYS.tenantA);
  const search = async (body: Record<string, unknown>) =>
    (
      await a()
        .post('/api/v1/search')
        .send({ namespace, ...body })
        .expect(200)
    ).body as SearchBody;
  const chunkCount = async (documentId: string) =>
    Number(
      (
        await t.db.query<{ count: string }>(
          'select count(*) from rag_document_chunks where document_id = $1',
          [documentId],
        )
      ).rows[0].count,
    );

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('serves the server-side ingestion UI without a key', async () => {
    const response = await t.http().get('/ui').expect(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('/api/v1');
  });

  it('reports health (application + PostgreSQL) without a key', async () => {
    const { body } = await t.http().get('/health').expect(200);
    expect(body).toMatchObject({
      status: 'ok',
      database: 'up',
      ingestion_worker: { enabled: true, running: true },
    });
  });

  describe('authentication', () => {
    it('rejects missing and unknown keys', async () => {
      await t.http().post('/api/v1/search').send({ query: 'x' }).expect(401);
      await t
        .http()
        .post('/api/v1/search')
        .set('x-api-key', 'not-a-key')
        .send({ query: 'x' })
        .expect(401);
      // Bearer form is accepted too.
      await t
        .http()
        .post('/api/v1/search')
        .set('authorization', `Bearer ${TEST_KEYS.tenantA}`)
        .send({ query: 'x', namespace })
        .expect(200);
    });

    it('enforces scopes', async () => {
      const searchOnly = as(TEST_KEYS.searchOnly);
      await searchOnly
        .post('/api/v1/search')
        .send({ query: 'x', namespace })
        .expect(200);
      await searchOnly.get('/api/v1/documents').expect(403);
      await searchOnly
        .post('/api/v1/documents')
        .attach('file', Buffer.from('hola'), 'a.txt')
        .expect(403);
    });
  });

  describe('ingestion', () => {
    it('PDF: upload -> ingest (wait) -> page/section aware chunks', async () => {
      const upload = await a()
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

      const ingest = await a()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ wait: true })
        .expect(200);
      expect(ingest.body.document).toMatchObject({
        status: 'COMPLETED',
        error: null,
        attempts: 1,
        system: {
          parser: { page_count: 3, title: 'Informe anual ACME' },
          chunking: { version: CHUNKING_VERSION, strategy: 'auto' },
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

      const chunks = await a()
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

    it('XLSX: upload with ingest=true is queued and processed by the worker', async () => {
      const upload = await a()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .field('ingest', 'true')
        .attach('file', await buildSalesWorkbook(), 'ventas.xlsx')
        .expect(201);
      expect(['QUEUED', 'PROCESSING', 'COMPLETED']).toContain(
        upload.body.document.status,
      );
      ids.xlsx = upload.body.document.id;

      const document = await waitForTerminal(t, ids.xlsx, TEST_KEYS.tenantA);
      expect(document).toMatchObject({
        status: 'COMPLETED',
        system: { parser: { sheet_count: 2 } },
      });

      const chunks = (
        await a().get(`/api/v1/documents/${ids.xlsx}/chunks`).expect(200)
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
      expect(chunks[1].metadata).toMatchObject({
        row_start: 4,
        row_end: 6,
        table_row_count: 3,
      });
    });

    it('TXT: upload -> ingest -> markdown sections', async () => {
      const upload = await a()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .field('tags', JSON.stringify(['soporte']))
        .attach('file', Buffer.from(HANDBOOK_TXT, 'utf8'), 'manual-soporte.md')
        .expect(201);
      ids.txt = upload.body.document.id;

      const ingest = await a()
        .post(`/api/v1/documents/${ids.txt}/ingest`)
        .send({ wait: true })
        .expect(200);
      expect(ingest.body.document).toMatchObject({
        status: 'COMPLETED',
        system: { parser: { encoding: 'utf-8', markdown: true } },
      });
    });

    it('is idempotent: same file is not duplicated and unchanged documents are not re-embedded', async () => {
      const again = await a()
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

      const skipped = await a()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ wait: true })
        .expect(200);
      expect(skipped.body).toMatchObject({
        started: false,
        reason: 'already_ingested',
      });

      const before = await chunkCount(ids.pdf);
      const forced = await a()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ wait: true, force: true })
        .expect(200);
      expect(forced.body.started).toBe(true);
      expect(await chunkCount(ids.pdf)).toBe(before);
    });

    it('records the failing stage and leaves no chunks for a corrupt PDF', async () => {
      const upload = await a()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .attach(
          'file',
          Buffer.from('%PDF-1.4\nthis is not really a pdf'),
          'roto.pdf',
        )
        .expect(201);
      const ingest = await a()
        .post(`/api/v1/documents/${upload.body.document.id}/ingest`)
        .send({ wait: true })
        .expect(200);

      expect(ingest.body.document).toMatchObject({
        status: 'FAILED',
        stage: 'PARSING',
        error: { stage: 'PARSING', code: 'PDF_INVALID' },
        chunk_count: 0,
        attempts: 1, // permanent error: not retried
      });
      expect(await chunkCount(upload.body.document.id)).toBe(0);
    });

    it('keeps the previous version searchable when persistence fails mid re-ingestion', async () => {
      const before = (
        await t.db.query<{ id: string }>(
          'select id from rag_document_chunks where document_id = $1 order by id',
          [ids.txt],
        )
      ).rows;
      const repository = t.get<PgVectorDocumentRepository>(
        PgVectorDocumentRepository,
      );
      const spy = jest
        .spyOn(repository, 'commitIngestion')
        .mockRejectedValueOnce(new Error('disk full'));

      const ingest = await a()
        .post(`/api/v1/documents/${ids.txt}/ingest`)
        .send({ wait: true, force: true })
        .expect(200);
      spy.mockRestore();

      expect(ingest.body.document).toMatchObject({
        status: 'FAILED',
        error: { stage: 'STORAGE' },
      });
      const after = (
        await t.db.query<{ id: string }>(
          'select id from rag_document_chunks where document_id = $1 order by id',
          [ids.txt],
        )
      ).rows;
      expect(after).toEqual(before);

      await a()
        .post(`/api/v1/documents/${ids.txt}/ingest`)
        .send({ wait: true, force: true })
        .expect(200);
    });

    it('validates input at the boundary', async () => {
      await a()
        .post('/api/v1/documents')
        .attach('file', Buffer.from('png'), 'foto.png')
        .expect(415);
      await a()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .expect(400);
      await a()
        .post('/api/v1/documents')
        .field('metadata', 'not json')
        .attach('file', Buffer.from('hola'), 'a.txt')
        .expect(400);
      await a()
        .post('/api/v1/documents/not-a-uuid/ingest')
        .send({})
        .expect(400);
      await a()
        .get('/api/v1/documents/00000000-0000-4000-8000-000000000000')
        .expect(404);
      await a()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ chunking: { chunk_size: 10 } })
        .expect(400);
    });

    it('lists documents by namespace and status', async () => {
      const completed = await a()
        .get('/api/v1/documents')
        .query({ namespace, status: 'COMPLETED' })
        .expect(200);
      expect(completed.body.items.map((item: any) => item.id).sort()).toEqual(
        [ids.pdf, ids.xlsx, ids.txt].sort(),
      );
    });
  });

  describe('namespace isolation (the key decides, not the body)', () => {
    const b = () => as(TEST_KEYS.tenantB);

    it('refuses namespaces outside the key on search, upload and list', async () => {
      await b()
        .post('/api/v1/search')
        .send({ namespace, query: 'facturación 2025 región Norte' })
        .expect(403);
      await b()
        .post('/api/v1/documents')
        .field('namespace', namespace)
        .attach('file', Buffer.from('intruso'), 'x.txt')
        .expect(403);
      const listed = await b()
        .get('/api/v1/documents')
        .query({ namespace })
        .expect(200);
      expect(listed.body).toMatchObject({ total: 0, items: [] });
    });

    it('hides other tenants documents behind 404 on get, chunks, ingest and delete', async () => {
      await b().get(`/api/v1/documents/${ids.pdf}`).expect(404);
      await b().get(`/api/v1/documents/${ids.pdf}/chunks`).expect(404);
      await b()
        .post(`/api/v1/documents/${ids.pdf}/ingest`)
        .send({ force: true })
        .expect(404);
      await b().delete(`/api/v1/documents/${ids.pdf}`).expect(404);
      await a().get(`/api/v1/documents/${ids.pdf}`).expect(200);
    });

    it('defaults to the key namespace and only lists what the key can see', async () => {
      const unscoped = await b().get('/api/v1/documents').expect(200);
      expect(
        unscoped.body.items.every(
          (item: any) => item.namespace === 'otro-tenant',
        ),
      ).toBe(true);

      const body = (
        await b()
          .post('/api/v1/search')
          .send({ query: 'facturación 2025 región Norte', min_score: -1 })
          .expect(200)
      ).body as SearchBody;
      expect(body).toMatchObject({
        namespace: 'otro-tenant',
        results: [],
        verdict: { status: 'none', reasons: ['no_searchable_documents'] },
      });
    });

    it('asks for a namespace when the key has several and none is given', async () => {
      await a().post('/api/v1/search').send({ query: 'x' }).expect(400);
    });
  });

  describe('retrieval API', () => {
    it('answers a spreadsheet question with the row, sheet, source and evidence contract', async () => {
      const body = await search({
        query: '¿Cuál fue la facturación USD de 2025 en la región Norte?',
        top_k: 3,
      });
      expect(body).toMatchObject({
        found: true,
        verdict: { status: 'sufficient' },
        content_is_untrusted: true,
        coverage: { searchable: 3 },
        retrieval: { mode: 'hybrid', identifiers: ['2025'] },
      });
      const top = body.results[0];
      expect(top.metadata).toMatchObject({
        document_name: 'ventas.xlsx',
        sheet: 'Facturación',
        chunk_type: 'table_rows',
        chunk: { row_start: 4, row_end: 6 },
      });
      expect(top.content).toContain('1250000');
      expect(top.signals).toMatchObject({
        identifiers_matched: ['2025'],
        strength: 'strong',
      });
      expect(top.source).toMatchObject({
        document_id: ids.xlsx,
        document_name: 'ventas.xlsx',
        chunk_hash: expect.any(String),
        document_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        chunking_version: CHUNKING_VERSION,
        locator: {
          sheet: 'Facturación',
          rows: { start: 4, end: 6, matched: [5, 6] },
        },
      });
      // Rows holding the requested identifier are cited precisely.
      expect(top.citation).toBe(
        'ventas.xlsx, sheet "Facturación", rows 5, 6, section "Reporte de facturación anual"',
      );
      expect(body.results.map((result) => result.rank)).toEqual(
        body.results.map((_, index) => index + 1),
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
      expect(body).toMatchObject({
        found: false,
        results: [],
        verdict: { status: 'none' },
      });
      expect(body.message).toContain('No relevant evidence');
    });

    it('flags evidence that does not contain the requested identifier as weak', async () => {
      const body = await search({
        query: 'facturación de la región Norte en 2031',
      });
      if (body.results.length) {
        expect(body.verdict.status).toBe('weak');
        expect(body.verdict.reasons).toContain('identifiers_not_found');
      } else expect(body.verdict.status).toBe('none');
    });

    it('keeps the previous vector-only behaviour available as mode=vector', async () => {
      const body = await search({
        query: '¿Cuál fue la facturación USD de 2025 en la región Norte?',
        mode: 'vector',
      });
      expect(body.retrieval).toMatchObject({
        mode: 'vector',
        lexical_candidates: 0,
      });
      expect(body.results.map((result) => result.score)).toEqual(
        [...body.results.map((result) => result.score)].sort((x, y) => y - x),
      );
    });

    it('validates search requests', async () => {
      await a().post('/api/v1/search').send({ namespace }).expect(400);
      await a()
        .post('/api/v1/search')
        .send({ query: 'x', top_k: 0, namespace })
        .expect(400);
      await a()
        .post('/api/v1/search')
        .send({ query: 'x', filters: { unknown: 1 }, namespace })
        .expect(400);
      await a()
        .post('/api/v1/search')
        .send({ query: 'x', mode: 'magic', namespace })
        .expect(400);
    });
  });

  describe('legacy endpoints and deletion', () => {
    it('keeps /ingestion/text and /query/fetch working over the same pipeline', async () => {
      const admin = as(TEST_KEYS.admin);
      const ingested = await admin
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

      const fetched = await admin
        .post('/api/v1/query/fetch')
        .send({ question: 'presupuesto de tecnología aprobado por el comité' })
        .expect(200);
      expect(fetched.body[0]).toMatchObject({
        metadata: { source: 'notas/dia-1' },
      });
    });

    it('deletes a document and its chunks', async () => {
      await a().delete(`/api/v1/documents/${ids.txt}`).expect(204);
      await a().get(`/api/v1/documents/${ids.txt}`).expect(404);
      expect(await chunkCount(ids.txt)).toBe(0);

      const body = await search({
        query: 'incidentes críticos ingeniero de guardia escalamiento',
      });
      expect(
        body.results.every((result) => result.document_id !== ids.txt),
      ).toBe(true);
    });
  });
});
