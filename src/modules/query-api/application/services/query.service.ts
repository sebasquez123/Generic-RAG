import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import { RetrievalService } from '~/modules/retrieval/application/services/retrieval.service';
import {
  ScoringService,
  type SelectionResult,
} from '~/modules/scoring/application/services/scoring.service';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import type { SemanticQuery } from '../../domain/entities/semantic-query.entity';
import {
  QueryPolicyService,
  type QueryInput,
} from '../../domain/services/query-policy.service';

export interface SearchOutcome extends SelectionResult {
  query: SemanticQuery;
  embeddingVersion: string;
  tookMs: number;
}

@Injectable()
export class QueryService {
  private readonly policy: QueryPolicyService;
  private readonly logger = new LoggerService(QueryService.name);

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly scoring: ScoringService,
    @Inject(RAG_CONFIG) config: RagConfig,
  ) {
    this.policy = new QueryPolicyService({
      defaultNamespace: config.defaultNamespace,
      ...config.search,
    });
  }

  async search(input: QueryInput): Promise<SearchOutcome> {
    const startedAt = Date.now();
    const query = this.policy.normalize(input);
    const candidates = await this.retrieval.retrieveCandidates(query);
    const selection = this.scoring.select(candidates, query);
    const tookMs = Date.now() - startedAt;

    this.logger.event('Retrieval completed', {
      namespace: query.namespace,
      topK: query.topK,
      minScore: query.minScore,
      filters: Object.keys(query.filters),
      candidates: selection.candidates,
      returned: selection.results.length,
      belowThreshold: selection.belowThreshold,
      bestScore: selection.results[0]?.score,
      tookMs,
    });
    return {
      ...selection,
      query,
      embeddingVersion: this.retrieval.embeddingVersion,
      tookMs,
    };
  }
}
