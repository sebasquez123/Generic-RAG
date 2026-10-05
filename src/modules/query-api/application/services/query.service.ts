import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import { EmbeddingProviderError } from '~/modules/4_embedding/domain/errors/embedding_errors';
import { RetrievalService } from '~/modules/retrieval/application/services/retrieval.service';
import {
  ScoringService,
  type SelectionResult,
} from '~/modules/scoring/application/services/scoring.service';
import { decideVerdict, type Verdict } from '~/modules/scoring/domain/evidence';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import { LoggerService } from '~/shared/logging/main.logger';
import { queryTerms, type QueryTerms } from '~/shared/text/lexical';
import type { SearchCoverage } from '~/shared/types/semantic-pipeline.type';
import type { SemanticQuery } from '../../domain/entities/semantic-query.entity';
import {
  QueryPolicyService,
  type QueryInput,
} from '../../domain/services/query-policy.service';

export interface SearchOutcome extends SelectionResult {
  query: SemanticQuery;
  terms: QueryTerms;
  coverage: SearchCoverage;
  verdict: Verdict;
  embeddingVersion: string;
  tookMs: number;
}

/** The query cannot be served right now (embedding provider down/throttled). */
export class SearchUnavailableError extends Error {
  readonly code = 'SEARCH_UNAVAILABLE';
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
    const terms = queryTerms(query.text);

    const [candidates, coverage] = await Promise.all([
      this.retrieval
        .retrieveCandidates({
          ...query,
          lexicalTerms: query.mode === 'hybrid' ? terms : undefined,
        })
        .catch((error: unknown) => {
          // Agents should retry later, not treat this as "no evidence".
          if (error instanceof EmbeddingProviderError)
            throw new SearchUnavailableError(
              `Search temporarily unavailable: ${error.message}`,
            );
          throw error;
        }),
      this.retrieval.coverage(query.namespace, query.filters),
    ]);
    const selection = this.scoring.select(candidates, query, terms);
    const verdict = decideVerdict(
      selection.results,
      terms,
      coverage,
      selection.candidates,
    );
    const tookMs = Date.now() - startedAt;

    this.logger.event('Retrieval completed', {
      namespace: query.namespace,
      mode: query.mode,
      topK: query.topK,
      minScore: query.minScore,
      filters: Object.keys(query.filters),
      candidates: selection.candidates,
      lexicalCandidates: selection.lexicalCandidates,
      returned: selection.results.length,
      belowThreshold: selection.belowThreshold,
      bestScore: selection.results[0]?.score,
      verdict: verdict.status,
      reasons: verdict.reasons,
      tookMs,
    });
    return {
      ...selection,
      query,
      terms,
      coverage,
      verdict,
      embeddingVersion: this.retrieval.embeddingVersion,
      tookMs,
    };
  }
}
