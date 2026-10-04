import type { EmbeddingProviderPort } from '../../domain/ports/embedding-provider.port';

// Function words would otherwise dominate lexical similarity.
const STOPWORDS = new Set(
  (
    'a al como con de del el en es la las lo los o para por que se su sus un una uno y ' +
    'the of and to in is for on with by an or at as be this that from'
  ).split(' '),
);

/**
 * Deterministic lexical embedder (feature hashing of words and word bigrams).
 *
 * It is NOT semantic. It exists so the whole pipeline can run offline in tests
 * and local smoke runs without a Gemini key. Never use it for real retrieval.
 */
export class HashingEmbeddingAdapter implements EmbeddingProviderPort {
  readonly maxBatchSize = 1000;
  readonly descriptor;

  constructor(private readonly dimensions: number) {
    this.descriptor = {
      provider: 'hashing',
      model: 'lexical-hash-v1',
      dimensions,
    };
  }

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => this.vectorize(text)));
  }

  private vectorize(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const words =
      text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter((word) => !STOPWORDS.has(word)) ?? [];
    const features = [
      ...words,
      ...words.slice(1).map((word, index) => `${words[index]}_${word}`),
    ];

    for (const feature of features) {
      const hash = this.fnv1a(feature);
      const sign = hash & 1 ? 1 : -1;
      vector[hash % this.dimensions] += sign;
    }

    const norm = Math.hypot(...vector);
    if (norm === 0) {
      vector[0] = 1;
      return vector;
    }
    return vector.map((value) => value / norm);
  }

  private fnv1a(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }
}
