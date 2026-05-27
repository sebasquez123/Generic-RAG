import { Injectable } from '@nestjs/common';
import type { EmbeddingVector } from '../domain/types/embedding-vector.type';

@Injectable()
export class EmbeddingService {
  embed(input: string): EmbeddingVector {
    // Replace this deterministic placeholder with the single project-standard
    // embedding provider; keep provider choice outside the public API.
    const normalized = input.trim().toLowerCase();
    const vector = Array.from({ length: 8 }, () => 0);

    for (let index = 0; index < normalized.length; index += 1) {
      const bucket = index % vector.length;
      vector[bucket] += normalized.charCodeAt(index) / 255;
    }

    return this.normalize(vector);
  }

  private normalize(vector: EmbeddingVector): EmbeddingVector {
    const magnitude = Math.hypot(...vector) || 1;
    return vector.map((value) => Number((value / magnitude).toFixed(6)));
  }
}
