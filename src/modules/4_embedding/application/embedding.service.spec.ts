import { GeminiLlmService } from "~/modules/5_LLM's/application/services/gemini-llm.service";
import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  const service = new EmbeddingService({
    embedText: async (input: string) => {
      const normalized = input.trim().toLowerCase();
      const vector = Array.from({ length: 8 }, () => 0);

      for (let index = 0; index < normalized.length; index += 1) {
        vector[index % vector.length] += normalized.charCodeAt(index) / 255;
      }

      const magnitude = Math.hypot(...vector) || 1;
      return vector.map((value) => Number((value / magnitude).toFixed(6)));
    },
  } as GeminiLlmService);

  it('transforms text into a stable embedding vector', async () => {
    const first = await service.embed('Semantic ingestion');
    const second = await service.embed(' Semantic ingestion ');

    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    expect(first.some((value) => value > 0)).toBe(true);
  });
});
