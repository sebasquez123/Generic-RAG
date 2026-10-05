import {
  resolveNamespace,
  type NamespaceAccess,
} from '~/shared/auth/principal';
import type { SearchFilters } from '~/shared/types/semantic-pipeline.type';
import {
  SemanticQuery,
  type ResultOrder,
  type SearchMode,
} from '../entities/semantic-query.entity';

export interface QueryPolicyConfig {
  defaultNamespace: string;
  defaultTopK: number;
  maxTopK: number;
  minScore: number;
  defaultMode: SearchMode;
}

export interface QueryInput {
  query: string;
  namespace?: string;
  /** Namespaces granted to the caller's API key. */
  access: NamespaceAccess;
  topK?: number;
  minScore?: number;
  filters?: SearchFilters;
  orderBy?: ResultOrder;
  mode?: SearchMode;
}

export class QueryPolicyService {
  constructor(private readonly config: QueryPolicyConfig) {}

  normalize(input: QueryInput): SemanticQuery {
    const topK = Math.max(
      1,
      Math.min(input.topK ?? this.config.defaultTopK, this.config.maxTopK),
    );
    const minScore = Math.max(
      -1,
      Math.min(input.minScore ?? this.config.minScore, 1),
    );
    return new SemanticQuery(
      input.query.replace(/\s+/g, ' ').trim(),
      resolveNamespace(
        input.access,
        input.namespace,
        this.config.defaultNamespace,
      ),
      topK,
      minScore,
      input.filters ?? {},
      input.orderBy ?? 'score',
      input.mode ?? this.config.defaultMode,
    );
  }
}
