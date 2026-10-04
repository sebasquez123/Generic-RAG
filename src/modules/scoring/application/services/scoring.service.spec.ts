import {
  ChunkType,
  DocumentType,
  type RetrievedContext,
} from '~/shared/types/semantic-pipeline.type';
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
      { topK: 5, minScore: 0.6, orderBy: 'score' },
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
      { topK: 2, minScore: 0, orderBy: 'score' },
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
      { topK: 5, minScore: 0, orderBy: 'document' },
    );
    expect(
      selection.results.map((result) => [result.chunkId, result.rank]),
    ).toEqual([
      ['d1-2', 3],
      ['d1-5', 1],
      ['d2-1', 2],
    ]);
  });
});
