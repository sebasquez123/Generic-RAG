import type { RetrievedContext } from '../../../shared/types/rag-shared.type';
import type { VectorContextRepository } from '../ports/vector-context.repository';
export declare class VectorMemoryService {
    private readonly repository;
    constructor(repository: VectorContextRepository);
    retrieve(question: string, limit: number): Promise<RetrievedContext[]>;
}
