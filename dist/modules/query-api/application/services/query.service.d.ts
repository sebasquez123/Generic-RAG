import { RetrievalService } from '../../../retrieval/application/services/retrieval.service';
import { ScoringService } from '../../../scoring/application/services/scoring.service';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
export declare class QueryService {
    private readonly retrieval;
    private readonly scoring;
    private readonly policy;
    constructor(retrieval: RetrievalService, scoring: ScoringService);
    normalize(question: string, contextLimit?: number): import("../../domain/entities/semantic-query.entity").SemanticQuery;
    fetchContexts(question: string, contextLimit?: number): Promise<RetrievedContext[]>;
}
