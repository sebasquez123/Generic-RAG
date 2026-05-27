import { RagQuery } from '../entities/rag-query.entity';

export class RagPolicyService {
  normalizeQuery(question: string, contextLimit = 5): RagQuery {
    return new RagQuery(
      question.trim(),
      Math.max(1, Math.min(contextLimit, 10)),
    );
  }
}
