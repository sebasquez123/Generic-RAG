import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  const service = new EmbeddingService();

  it('transforms text into a stable embedding vector', () => {
    const first = service.embed('Semantic ingestion');
    const second = service.embed(' Semantic ingestion ');

    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    expect(first.some((value) => value > 0)).toBe(true);
  });
});
