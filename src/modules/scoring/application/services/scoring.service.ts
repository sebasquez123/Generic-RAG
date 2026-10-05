import { Injectable } from '@nestjs/common';
import type { QueryTerms } from '~/shared/text/lexical';
import type { RetrievedContext } from '~/shared/types/semantic-pipeline.type';
import { evaluateContext, type EvaluatedContext } from '../../domain/evidence';

export type SearchMode = 'hybrid' | 'vector';

export interface SelectionPolicy {
  topK: number;
  minScore: number;
  orderBy: 'score' | 'document';
  mode: SearchMode;
}

export interface DuplicateSource {
  chunkId: string;
  documentId: string;
  documentName: string;
}

export interface RankedContext extends EvaluatedContext {
  /** 1-based position by relevance, stable even when reordered by document. */
  rank: number;
  /** Same text found in other documents (dropped as duplicates, kept as provenance). */
  alsoFoundIn: DuplicateSource[];
}

export interface SelectionResult {
  results: RankedContext[];
  candidates: number;
  lexicalCandidates: number;
  belowThreshold: number;
  duplicates: number;
}

// Reciprocal Rank Fusion constant (Cormack et al.): dampens the head of each list.
const RRF_K = 60;

const NO_TERMS: QueryTerms = { terms: [], identifiers: [] };

@Injectable()
export class ScoringService {
  /**
   * Keeps only qualifying evidence, drops duplicated content, then cuts to
   * topK. Never pads results to reach topK.
   *
   * - vector mode: qualifies by similarity >= minScore, ordered by similarity
   *   (the original behaviour, kept as the evaluation baseline).
   * - hybrid mode: also qualifies chunks containing every identifier of the
   *   query (or every term), and orders by Reciprocal Rank Fusion of the vector
   *   and full-text ranks, putting chunks with all identifiers first.
   */
  select(
    contexts: RetrievedContext[],
    policy: SelectionPolicy,
    terms: QueryTerms = NO_TERMS,
  ): SelectionResult {
    const hybrid = policy.mode === 'hybrid';
    const evaluated = contexts.map((context) =>
      evaluateContext(context, terms, policy.minScore, hybrid),
    );
    const ordered = hybrid ? this.fuse(evaluated) : this.byScore(evaluated);
    const relevant = ordered.filter((context) => context.qualifies);

    const kept = new Map<string, RankedContext>();
    for (const context of relevant) {
      const first = kept.get(context.contentHash);
      if (!first) {
        kept.set(context.contentHash, { ...context, rank: 0, alsoFoundIn: [] });
        continue;
      }
      if (
        first.documentId !== context.documentId &&
        !first.alsoFoundIn.some((s) => s.documentId === context.documentId)
      )
        first.alsoFoundIn.push({
          chunkId: context.chunkId,
          documentId: context.documentId,
          documentName: context.documentName,
        });
    }

    const ranked = [...kept.values()]
      .slice(0, policy.topK)
      .map((context, index) => ({ ...context, rank: index + 1 }));

    if (policy.orderBy === 'document') {
      // Group by the document's best rank, then reading order inside it.
      const bestRank = new Map<string, number>();
      ranked.forEach((context) => {
        if (!bestRank.has(context.documentId))
          bestRank.set(context.documentId, context.rank);
      });
      ranked.sort(
        (left, right) =>
          bestRank.get(left.documentId)! - bestRank.get(right.documentId)! ||
          left.chunkIndex - right.chunkIndex,
      );
    }

    return {
      results: ranked,
      candidates: contexts.length,
      lexicalCandidates: contexts.filter((c) => c.lexicalRank !== undefined)
        .length,
      belowThreshold: ordered.length - relevant.length,
      duplicates: relevant.length - kept.size,
    };
  }

  private byScore(contexts: EvaluatedContext[]): EvaluatedContext[] {
    return [...contexts].sort((left, right) => right.score - left.score);
  }

  private fuse(contexts: EvaluatedContext[]): EvaluatedContext[] {
    const vectorRank = new Map(
      this.byScore(contexts).map((context, index) => [context.chunkId, index]),
    );
    const lexicalRank = new Map(
      contexts
        .filter((context) => context.lexicalRank !== undefined)
        .sort((left, right) => right.lexicalRank! - left.lexicalRank!)
        .map((context, index) => [context.chunkId, index]),
    );
    const fused = (context: EvaluatedContext) => {
      const lexical = lexicalRank.get(context.chunkId);
      return (
        1 / (RRF_K + vectorRank.get(context.chunkId)! + 1) +
        (lexical === undefined ? 0 : 1 / (RRF_K + lexical + 1))
      );
    };
    const allIdentifiers = (context: EvaluatedContext) =>
      context.signals.qualifiedBy.includes('identifiers') ? 1 : 0;

    return [...contexts].sort(
      (left, right) =>
        allIdentifiers(right) - allIdentifiers(left) ||
        fused(right) - fused(left),
    );
  }
}
