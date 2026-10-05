import type { SearchFilters } from '~/shared/types/semantic-pipeline.type';

export type ResultOrder = 'score' | 'document';

/** hybrid = vector + full-text (default); vector = similarity only (baseline). */
export type SearchMode = 'hybrid' | 'vector';

export class SemanticQuery {
  constructor(
    public readonly text: string,
    public readonly namespace: string,
    public readonly topK: number,
    /** Minimum cosine similarity; weaker matches are not evidence. */
    public readonly minScore: number,
    public readonly filters: SearchFilters,
    /** `document` groups results by document and chunk order (reading order). */
    public readonly orderBy: ResultOrder,
    public readonly mode: SearchMode,
  ) {}
}
