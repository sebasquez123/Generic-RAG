import { queryTerms } from '~/shared/text/lexical';
import {
  ChunkType,
  DocumentType,
  type RetrievedContext,
  type SearchCoverage,
} from '~/shared/types/semantic-pipeline.type';
import {
  decideVerdict,
  evaluateContext,
  type EvaluatedContext,
} from './evidence';

const context = (
  overrides: Partial<RetrievedContext> = {},
): RetrievedContext => ({
  chunkId: 'c',
  documentId: 'd',
  documentName: 'ventas.xlsx',
  documentType: DocumentType.Xlsx,
  source: 'ventas.xlsx',
  tags: [],
  documentMetadata: {},
  chunkIndex: 0,
  chunkType: ChunkType.Text,
  content: 'contenido',
  contentHash: 'h',
  chunkMetadata: {},
  createdAt: new Date(),
  score: 0.7,
  documentHash: 'dh',
  embeddingVersion: 'v',
  ...overrides,
});

const fullCoverage: SearchCoverage = {
  documentsTotal: 3,
  searchable: 3,
  pending: 0,
  inProgress: 0,
  failed: 0,
  requiresReindex: 0,
};

const evaluate = (
  query: string,
  overrides: Partial<RetrievedContext>,
): EvaluatedContext =>
  evaluateContext(context(overrides), queryTerms(query), 0.6, true);

describe('evidence verdict', () => {
  it('none: explains whether nothing matched or the corpus was not fully searchable', () => {
    expect(decideVerdict([], queryTerms('x'), fullCoverage, 0)).toEqual({
      status: 'none',
      reasons: ['no_candidates'],
    });
    expect(
      decideVerdict([], queryTerms('x'), { ...fullCoverage, inProgress: 2 }, 5),
    ).toEqual({
      status: 'none',
      reasons: ['below_threshold', 'incomplete_coverage'],
    });
    expect(
      decideVerdict([], queryTerms('x'), { ...fullCoverage, searchable: 0 }, 0),
    ).toEqual({ status: 'none', reasons: ['no_searchable_documents'] });
  });

  it('sufficient: a strong result', () => {
    const result = evaluate('facturación norte', {
      content: 'Facturación región Norte',
    });
    expect(
      decideVerdict([result], queryTerms('facturación norte'), fullCoverage, 1),
    ).toEqual({
      status: 'sufficient',
      reasons: [],
    });
  });

  it('sufficient: every meaningful word of a name lookup is present, even with low similarity', () => {
    const query = 'Natalia Rendón';
    const result = evaluateContext(
      context({
        content: 'Row 18: Nombre: Natalia Rendón | Cargo: Ingeniera',
        score: 0.1,
      }),
      queryTerms(query),
      0.6,
      true,
    );
    expect(result.signals).toMatchObject({
      qualifiedBy: ['all_terms'],
      strength: 'strong',
    });
    expect(
      decideVerdict([result], queryTerms(query), fullCoverage, 1).status,
    ).toBe('sufficient');
  });

  it('weak: similar text that does not contain the requested identifier', () => {
    const query = 'factura FV-2025-99999';
    const result = evaluate(query, {
      content: 'Factura FV-2025-00001 emitida',
    });
    expect(result.signals.strength).toBe('weak');
    expect(decideVerdict([result], queryTerms(query), fullCoverage, 1)).toEqual(
      {
        status: 'weak',
        reasons: ['identifiers_not_found'],
      },
    );
  });

  it('partial: only some of the requested identifiers were found', () => {
    const query = 'facturas FV-2025-00001 y FV-2025-00002';
    const result = evaluate(query, { content: 'Factura FV-2025-00001' });
    expect(
      decideVerdict([result], queryTerms(query), fullCoverage, 1).status,
    ).toBe('partial');
  });

  it('partial: an aggregate question answered from a slice of a table', () => {
    const query = 'total facturación 2025';
    const slice = evaluate(query, {
      chunkType: ChunkType.TableRows,
      content: 'Row 5: Año: 2025 | Facturación: 10',
      chunkMetadata: { table_index: 0, row_count: 20, table_row_count: 500 },
    });
    expect(decideVerdict([slice], queryTerms(query), fullCoverage, 1)).toEqual({
      status: 'partial',
      reasons: ['table_partially_covered'],
    });
  });
});
