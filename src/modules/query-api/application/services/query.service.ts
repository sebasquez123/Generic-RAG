import { Injectable } from '@nestjs/common';
import { RetrievalService } from '../../../retrieval/application/services/retrieval.service';
import { ScoringService } from '../../../scoring/application/services/scoring.service';
import type { RetrievedContext } from '../../../../shared/types/semantic-pipeline.type';
import { QueryPolicyService } from '../../domain/services/query-policy.service';

@Injectable()
export class QueryService {
  private readonly policy = new QueryPolicyService();

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly scoring: ScoringService,
  ) {}

  normalize(question: string, contextLimit = 5) {
    return this.policy.normalize(question, contextLimit);
  }

  async fetchContexts(
    question: string,
    contextLimit = 5,
  ): Promise<RetrievedContext[]> {
    const query = this.normalize(question, contextLimit);
    const contexts = await this.retrieval.retrieve(
      query.question,
      query.contextLimit,
    );

    return this.scoring.scoreContexts(contexts);
  }
}
