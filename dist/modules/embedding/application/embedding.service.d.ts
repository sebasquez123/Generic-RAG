import type { EmbeddingVector } from '../domain/types/embedding-vector.type';
export declare class EmbeddingService {
    embed(input: string): EmbeddingVector;
    private normalize;
}
