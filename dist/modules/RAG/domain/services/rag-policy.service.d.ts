import { RagQuery } from '../entities/rag-query.entity';
export declare class RagPolicyService {
    normalizeQuery(question: string, contextLimit?: number): RagQuery;
}
