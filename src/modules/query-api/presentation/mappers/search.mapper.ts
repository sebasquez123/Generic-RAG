import type { RankedContext } from '~/modules/scoring/application/services/scoring.service';
import { ChunkType } from '~/shared/types/semantic-pipeline.type';
import type { SearchOutcome } from '../../application/services/query.service';

/** Human-readable source reference an LLM can quote verbatim. */
export function buildCitation(context: RankedContext): string {
  const parts = [context.documentName];
  if (context.pageStart !== undefined)
    parts.push(
      context.pageEnd !== undefined && context.pageEnd !== context.pageStart
        ? `pp. ${context.pageStart}-${context.pageEnd}`
        : `p. ${context.pageStart}`,
    );
  if (context.sheet) parts.push(`sheet "${context.sheet}"`);
  if (context.chunkType === ChunkType.TableSummary)
    parts.push('table overview');
  const rowStart = context.chunkMetadata['row_start'];
  const rowEnd = context.chunkMetadata['row_end'];
  if (typeof rowStart === 'number')
    parts.push(
      rowEnd !== undefined && rowEnd !== rowStart
        ? `rows ${rowStart}-${String(rowEnd)}`
        : `row ${rowStart}`,
    );
  if (context.section) parts.push(`section "${context.section}"`);
  return parts.join(', ');
}

export function toSearchResult(context: RankedContext) {
  return {
    rank: context.rank,
    chunk_id: context.chunkId,
    document_id: context.documentId,
    content: context.content,
    score: Number(context.score.toFixed(4)),
    citation: buildCitation(context),
    metadata: {
      document_name: context.documentName,
      document_type: context.documentType,
      source: context.source,
      tags: context.tags,
      page_start: context.pageStart ?? null,
      page_end: context.pageEnd ?? null,
      section: context.section ?? null,
      sheet: context.sheet ?? null,
      chunk_index: context.chunkIndex,
      chunk_type: context.chunkType,
      created_at: context.createdAt.toISOString(),
      chunk: context.chunkMetadata,
      document: context.documentMetadata,
    },
  };
}

export function toSearchResponse(outcome: SearchOutcome) {
  const found = outcome.results.length > 0;
  return {
    query: outcome.query.text,
    namespace: outcome.query.namespace,
    found,
    message: found
      ? null
      : 'No relevant evidence found above min_score. Do not answer from this knowledge base.',
    results: outcome.results.map(toSearchResult),
    retrieval: {
      top_k: outcome.query.topK,
      min_score: outcome.query.minScore,
      order_by: outcome.query.orderBy,
      candidates: outcome.candidates,
      below_threshold: outcome.belowThreshold,
      duplicates_removed: outcome.duplicates,
      embedding_version: outcome.embeddingVersion,
      took_ms: outcome.tookMs,
    },
  };
}
