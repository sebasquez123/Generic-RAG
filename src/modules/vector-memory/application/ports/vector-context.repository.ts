import type { RetrievedContext } from '../../../RAG/types/rag-shared.type';

export interface VectorContextRepository {
  retrieve(question: string, limit: number): Promise<RetrievedContext[]>;
}
