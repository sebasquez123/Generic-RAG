import type { RetrievedContext } from '../../../shared/types/rag-shared.type';
export interface VectorContextRepository {
    retrieve(question: string, limit: number): Promise<RetrievedContext[]>;
}
