import { SemanticQuery } from '../entities/semantic-query.entity';

export class QueryPolicyService {
  normalize(question: string, contextLimit = 5): SemanticQuery {
    return new SemanticQuery(
      question.trim(),
      Math.max(1, Math.min(contextLimit, 10)),
    );
  }
}
