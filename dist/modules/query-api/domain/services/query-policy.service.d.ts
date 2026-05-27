import { SemanticQuery } from '../entities/semantic-query.entity';
export declare class QueryPolicyService {
    normalize(question: string, contextLimit?: number): SemanticQuery;
}
