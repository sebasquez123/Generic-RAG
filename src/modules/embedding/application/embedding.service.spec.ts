import { GeminiInfrastructureService } from '../../../infrastructure/gemini/gemini.service';
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  const service = new EmbeddingService(new GeminiInfrastructureService());

  it('transforms text into a stable embedding vector', async () => {
    const first = await service.embed('Semantic ingestion');
    const second = await service.embed(' Semantic ingestion ');

    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    expect(first.some((value) => value > 0)).toBe(true);
  });
});
