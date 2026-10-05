import { indexTokens, type QueryTerms } from '~/shared/text/lexical';
import {
  ChunkType,
  type RetrievedContext,
  type SearchCoverage,
} from '~/shared/types/semantic-pipeline.type';

/**
 * Deterministic evidence rules. No model is involved: every decision can be
 * explained from the signals returned with each result.
 */

export type QualifiedBy = 'vector' | 'identifiers' | 'all_terms';
export type LexicalMatch = 'exact' | 'partial' | 'none';

export interface EvidenceSignals {
  vectorScore: number;
  lexicalRank?: number;
  lexicalMatch: LexicalMatch;
  matchedTerms: string[];
  /** Identifiers (numbers, codes, dates) of the query found in the chunk. */
  identifiersMatched: string[];
  qualifiedBy: QualifiedBy[];
  /**
   * strong: semantically close and not contradicted by a missing identifier,
   * every identifier of the query is present verbatim, or every meaningful
   * query word is (e.g. a person or company name).
   */
  strength: 'strong' | 'weak';
  /** Table rows of the chunk that contain the matched identifiers. */
  matchedRows?: number[];
}

export interface EvaluatedContext extends RetrievedContext {
  signals: EvidenceSignals;
  qualifies: boolean;
}

export type VerdictStatus = 'sufficient' | 'partial' | 'weak' | 'none';

export interface Verdict {
  status: VerdictStatus;
  reasons: string[];
}

const ROW_LINE = /^Row (\d+): (.*)$/;

function rowsContaining(content: string, identifiers: string[]): number[] {
  const rows: number[] = [];
  for (const line of content.split('\n')) {
    const match = ROW_LINE.exec(line);
    if (!match) continue;
    const tokens = indexTokens(match[2]);
    if (identifiers.every((identifier) => tokens.has(identifier)))
      rows.push(Number(match[1]));
  }
  return rows;
}

/**
 * @param lexical whether lexical signals may qualify a chunk (hybrid mode).
 *   In vector mode only the similarity threshold qualifies, as before.
 */
export function evaluateContext(
  context: RetrievedContext,
  terms: QueryTerms,
  minScore: number,
  lexical: boolean,
): EvaluatedContext {
  const tokens = indexTokens(
    [context.documentName, context.sheet, context.section, context.content]
      .filter(Boolean)
      .join(' '),
  );
  const matchedTerms = terms.terms.filter((term) => tokens.has(term));
  const identifiersMatched = terms.identifiers.filter((id) => tokens.has(id));
  const hasIdentifiers = terms.identifiers.length > 0;
  const allIdentifiers =
    hasIdentifiers && identifiersMatched.length === terms.identifiers.length;
  const allTerms =
    terms.terms.length >= 2 && matchedTerms.length === terms.terms.length;

  const qualifiedBy: QualifiedBy[] = [];
  if (context.score >= minScore) qualifiedBy.push('vector');
  if (lexical && allIdentifiers) qualifiedBy.push('identifiers');
  if (lexical && allTerms) qualifiedBy.push('all_terms');

  const contradicted = hasIdentifiers && !allIdentifiers;
  const strong =
    (context.score >= minScore && !contradicted) ||
    (lexical && allIdentifiers) ||
    (lexical && allTerms && !contradicted);

  const matchedRows =
    context.chunkType === ChunkType.TableRows && identifiersMatched.length
      ? rowsContaining(context.content, identifiersMatched)
      : undefined;

  return {
    ...context,
    qualifies: qualifiedBy.length > 0,
    signals: {
      vectorScore: context.score,
      lexicalRank: context.lexicalRank,
      lexicalMatch:
        allIdentifiers || allTerms
          ? 'exact'
          : matchedTerms.length
            ? 'partial'
            : 'none',
      matchedTerms,
      identifiersMatched,
      qualifiedBy,
      strength: strong ? 'strong' : 'weak',
      matchedRows: matchedRows?.length ? matchedRows : undefined,
    },
  };
}

// Questions whose answer needs a whole table, not a few matching rows.
const AGGREGATE_TERMS = new Set([
  'total',
  'totales',
  'suma',
  'sumar',
  'promedio',
  'media',
  'cuantos',
  'cuantas',
  'todos',
  'todas',
  'acumulado',
  'sum',
  'average',
  'count',
  'many',
  'overall',
  'all',
]);

/** True when an aggregate question is answered from a slice of a table. */
function tablePartiallyCovered(
  terms: QueryTerms,
  results: EvaluatedContext[],
): boolean {
  if (!terms.terms.some((term) => AGGREGATE_TERMS.has(term))) return false;
  const covered = new Map<string, { rows: number; total: number }>();
  for (const result of results) {
    if (result.chunkType !== ChunkType.TableRows) continue;
    const total = Number(result.chunkMetadata['table_row_count']);
    const rows = Number(result.chunkMetadata['row_count']);
    if (!Number.isFinite(total) || !Number.isFinite(rows)) continue;
    const key = `${result.documentId}:${result.sheet ?? ''}:${String(result.chunkMetadata['table_index'])}`;
    const entry = covered.get(key) ?? { rows: 0, total };
    entry.rows += rows;
    covered.set(key, entry);
  }
  return [...covered.values()].some((entry) => entry.rows < entry.total);
}

export function decideVerdict(
  results: EvaluatedContext[],
  terms: QueryTerms,
  coverage: SearchCoverage,
  candidates: number,
): Verdict {
  const reasons: string[] = [];
  const notSearchable =
    coverage.pending +
    coverage.inProgress +
    coverage.failed +
    coverage.requiresReindex;
  if (coverage.searchable === 0) reasons.push('no_searchable_documents');
  else if (notSearchable > 0) reasons.push('incomplete_coverage');

  if (results.length === 0) {
    if (coverage.searchable > 0)
      reasons.unshift(candidates === 0 ? 'no_candidates' : 'below_threshold');
    return { status: 'none', reasons };
  }

  const found = new Set(results.flatMap((r) => r.signals.identifiersMatched));
  if (terms.identifiers.length > 0) {
    if (found.size === 0) reasons.unshift('identifiers_not_found');
    else if (found.size < terms.identifiers.length)
      return {
        status: 'partial',
        reasons: ['identifiers_partially_found', ...reasons],
      };
  }
  if (tablePartiallyCovered(terms, results))
    return {
      status: 'partial',
      reasons: ['table_partially_covered', ...reasons],
    };

  if (results.some((result) => result.signals.strength === 'strong'))
    return { status: 'sufficient', reasons };
  if (!reasons.includes('identifiers_not_found'))
    reasons.unshift('low_similarity');
  return { status: 'weak', reasons };
}
