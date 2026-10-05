import {
  ChunkType,
  DocumentType,
  type RetrievedContext,
} from '~/shared/types/semantic-pipeline.type';
import { queryTerms } from '~/shared/text/lexical';
import { ScoringService } from './scoring.service';

const context = (overrides: Partial<RetrievedContext>): RetrievedContext => ({
  chunkId: overrides.chunkId ?? 'c',
  documentId: 'd1',
  documentName: 'doc.pdf',
  documentType: DocumentType.Pdf,
  source: 'doc.pdf',
  tags: [],
  documentMetadata: {},
  chunkIndex: 0,
  chunkType: ChunkType.Text,
  content: 'content',
  contentHash: overrides.chunkId ?? 'c',
  chunkMetadata: {},
  createdAt: new Date(),
  score: 0.5,
  documentHash: 'h',
  embeddingVersion: 'v',
  ...overrides,
});

describe('ScoringService', () => {
  const scoring = new ScoringService();

  it('applies the threshold and never pads results to top_k', () => {
    const selection = scoring.select(
      [
        context({ chunkId: 'a', score: 0.82 }),
        context({ chunkId: 'b', score: 0.41 }),
        context({ chunkId: 'c', score: 0.67 }),
      ],
      { topK: 5, minScore: 0.6, orderBy: 'score', mode: 'vector' },
    );
    expect(
      selection.results.map((result) => [result.chunkId, result.rank]),
    ).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
    expect(selection).toMatchObject({ candidates: 3, belowThreshold: 1 });
  });

  it('returns nothing when no candidate is relevant enough', () => {
    const selection = scoring.select([context({ score: 0.3 })], {
      topK: 5,
      minScore: 0.6,
      orderBy: 'score',
      mode: 'vector',
    });
    expect(selection.results).toEqual([]);
  });

  it('removes duplicated content and cuts to top_k', () => {
    const selection = scoring.select(
      [
        context({ chunkId: 'a', contentHash: 'same', score: 0.9 }),
        context({ chunkId: 'b', contentHash: 'same', score: 0.89 }),
        context({ chunkId: 'c', score: 0.8 }),
        context({ chunkId: 'd', score: 0.7 }),
      ],
      { topK: 2, minScore: 0, orderBy: 'score', mode: 'vector' },
    );
    expect(selection.results.map((result) => result.chunkId)).toEqual([
      'a',
      'c',
    ]);
    expect(selection.duplicates).toBe(1);
  });

  it('can order by document reading order while keeping relevance ranks', () => {
    const selection = scoring.select(
      [
        context({
          chunkId: 'd1-5',
          documentId: 'd1',
          chunkIndex: 5,
          score: 0.9,
        }),
        context({
          chunkId: 'd2-1',
          documentId: 'd2',
          chunkIndex: 1,
          score: 0.85,
        }),
        context({
          chunkId: 'd1-2',
          documentId: 'd1',
          chunkIndex: 2,
          score: 0.8,
        }),
      ],
      { topK: 5, minScore: 0, orderBy: 'document', mode: 'vector' },
    );
    expect(
      selection.results.map((result) => [result.chunkId, result.rank]),
    ).toEqual([
      ['d1-2', 3],
      ['d1-5', 1],
      ['d2-1', 2],
    ]);
  });

  describe('hybrid mode', () => {
    const rows = (code: string) =>
      `Row 7: Factura: FV-2025-00007 | Total: 10
Row 8: Factura: ${code} | Total: 20`;

    it('qualifies a chunk holding every identifier even below the vector threshold, and ranks it first', () => {
      const terms = queryTerms('factura FV-2025-00123');
      const selection = scoring.select(
        [
          context({
            chunkId: 'semantic',
            score: 0.8,
            content: 'facturas emitidas',
          }),
          context({
            chunkId: 'exact',
            score: 0.3,
            lexicalRank: 0.1,
            chunkType: ChunkType.TableRows,
            content: rows('FV-2025-00123'),
            chunkMetadata: { row_start: 7, row_end: 8 },
          }),
          context({
            chunkId: 'noise',
            score: 0.2,
            lexicalRank: 0.05,
            content: 'factura',
          }),
        ],
        { topK: 5, minScore: 0.6, orderBy: 'score', mode: 'hybrid' },
        terms,
      );
      expect(selection.results.map((r) => r.chunkId)).toEqual([
        'exact',
        'semantic',
      ]);
      expect(selection.results[0].signals).toMatchObject({
        qualifiedBy: ['identifiers', 'all_terms'],
        identifiersMatched: ['fv202500123'],
        lexicalMatch: 'exact',
        strength: 'strong',
        matchedRows: [8],
      });
      // Semantically close but missing the requested id: kept, but weak.
      expect(selection.results[1].signals).toMatchObject({
        qualifiedBy: ['vector'],
        strength: 'weak',
      });
      expect(selection.lexicalCandidates).toBe(2);
    });

    it('vector mode ignores lexical signals (baseline behaviour)', () => {
      const terms = queryTerms('factura FV-2025-00123');
      const selection = scoring.select(
        [
          context({
            chunkId: 'exact',
            score: 0.3,
            lexicalRank: 0.1,
            content: rows('FV-2025-00123'),
          }),
        ],
        { topK: 5, minScore: 0.6, orderBy: 'score', mode: 'vector' },
        terms,
      );
      expect(selection.results).toEqual([]);
    });

    it('keeps the provenance of duplicated content found in other documents', () => {
      const selection = scoring.select(
        [
          context({
            chunkId: 'a',
            documentId: 'd1',
            contentHash: 'same',
            score: 0.9,
          }),
          context({
            chunkId: 'b',
            documentId: 'd2',
            documentName: 'copy.pdf',
            contentHash: 'same',
            score: 0.8,
          }),
        ],
        { topK: 5, minScore: 0.5, orderBy: 'score', mode: 'hybrid' },
        queryTerms('contenido'),
      );
      expect(selection.results).toHaveLength(1);
      expect(selection.results[0].alsoFoundIn).toEqual([
        { chunkId: 'b', documentId: 'd2', documentName: 'copy.pdf' },
      ]);
    });
  });
});
