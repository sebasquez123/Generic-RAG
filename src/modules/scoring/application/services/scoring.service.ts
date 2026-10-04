import { Injectable } from '@nestjs/common';
import type { RetrievedContext } from '~/shared/types/semantic-pipeline.type';

export interface SelectionPolicy {
  topK: number;
  minScore: number;
  orderBy: 'score' | 'document';
}

export interface RankedContext extends RetrievedContext {
  /** 1-based position by relevance, stable even when reordered by document. */
  rank: number;
}

export interface SelectionResult {
  results: RankedContext[];
  candidates: number;
  belowThreshold: number;
  duplicates: number;
}

@Injectable()
export class ScoringService {
  /**
   * Keeps only evidence above the similarity threshold, drops duplicated
   * content, then cuts to topK. Never pads results to reach topK.
   */
  select(
    contexts: RetrievedContext[],
    policy: SelectionPolicy,
  ): SelectionResult {
    const sorted = [...contexts].sort(
      (left, right) => right.score - left.score,
    );
    const relevant = sorted.filter(
      (context) => context.score >= policy.minScore,
    );

    const seen = new Set<string>();
    const unique = relevant.filter((context) => {
      if (seen.has(context.contentHash)) return false;
      seen.add(context.contentHash);
      return true;
    });

    const ranked = unique
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
      belowThreshold: sorted.length - relevant.length,
      duplicates: relevant.length - unique.length,
    };
  }
}
