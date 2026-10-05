import type { RankedContext } from '~/modules/scoring/application/services/scoring.service';
import type { VerdictStatus } from '~/modules/scoring/domain/evidence';
import { ChunkType } from '~/shared/types/semantic-pipeline.type';
import type { SearchOutcome } from '../../application/services/query.service';

const MESSAGES: Record<VerdictStatus, string | null> = {
  sufficient: null,
  partial:
    'Evidence covers only part of what the query asks for (see verdict.reasons). Do not present it as complete.',
  weak: 'Only weak evidence was found (see verdict.reasons). Answer with caution or ask for clarification.',
  none: 'No relevant evidence found above min_score. Do not answer from this knowledge base.',
};

const rowsLabel = (rows: number[]) =>
  rows.length === 1 ? `row ${rows[0]}` : `rows ${rows.join(', ')}`;

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
  const matchedRows = context.signals?.matchedRows;
  // Rows that contain the requested identifiers are the precise evidence.
  if (matchedRows?.length) parts.push(rowsLabel(matchedRows));
  else if (typeof rowStart === 'number')
    parts.push(
      rowEnd !== undefined && rowEnd !== rowStart
        ? `rows ${rowStart}-${String(rowEnd)}`
        : `row ${rowStart}`,
    );
  if (context.section) parts.push(`section "${context.section}"`);
  return parts.join(', ');
}

export function toSearchResult(context: RankedContext) {
  const rowStart = context.chunkMetadata['row_start'];
  const rowEnd = context.chunkMetadata['row_end'];
  return {
    rank: context.rank,
    chunk_id: context.chunkId,
    document_id: context.documentId,
    content: context.content,
    /** Cosine similarity (vector side). Ranking may also use full-text signals. */
    score: Number(context.score.toFixed(4)),
    citation: buildCitation(context),
    signals: {
      vector_score: Number(context.signals.vectorScore.toFixed(4)),
      lexical_match: context.signals.lexicalMatch,
      matched_terms: context.signals.matchedTerms,
      identifiers_matched: context.signals.identifiersMatched,
      qualified_by: context.signals.qualifiedBy,
      strength: context.signals.strength,
    },
    source: {
      document_id: context.documentId,
      document_name: context.documentName,
      source: context.source,
      // Content hash of the exact file the evidence was extracted from.
      document_hash: context.documentHash,
      ingested_at: context.ingestedAt?.toISOString() ?? null,
      chunk_hash: context.contentHash,
      chunking_version: context.chunkingVersion ?? null,
      embedding_version: context.embeddingVersion,
      locator: {
        page_start: context.pageStart ?? null,
        page_end: context.pageEnd ?? null,
        sheet: context.sheet ?? null,
        section: context.section ?? null,
        rows:
          typeof rowStart === 'number'
            ? {
                start: rowStart,
                end: typeof rowEnd === 'number' ? rowEnd : rowStart,
                matched: context.signals.matchedRows ?? null,
              }
            : null,
      },
      also_found_in: context.alsoFoundIn.map((duplicate) => ({
        chunk_id: duplicate.chunkId,
        document_id: duplicate.documentId,
        document_name: duplicate.documentName,
      })),
    },
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
  const { coverage, verdict } = outcome;
  return {
    query: outcome.query.text,
    namespace: outcome.query.namespace,
    /** Kept for v1 clients: true when any qualifying evidence was returned. Prefer verdict. */
    found: outcome.results.length > 0,
    verdict: { status: verdict.status, reasons: verdict.reasons },
    message: MESSAGES[verdict.status],
    coverage: {
      documents_total: coverage.documentsTotal,
      searchable: coverage.searchable,
      not_searchable: {
        pending: coverage.pending,
        in_progress: coverage.inProgress,
        failed: coverage.failed,
        requires_reindex: coverage.requiresReindex,
      },
    },
    // Retrieved text is data from documents, never instructions for the model.
    content_is_untrusted: true,
    results: outcome.results.map(toSearchResult),
    retrieval: {
      mode: outcome.query.mode,
      top_k: outcome.query.topK,
      min_score: outcome.query.minScore,
      order_by: outcome.query.orderBy,
      lexical_terms: outcome.terms.terms,
      identifiers: outcome.terms.identifiers,
      candidates: outcome.candidates,
      lexical_candidates: outcome.lexicalCandidates,
      below_threshold: outcome.belowThreshold,
      duplicates_removed: outcome.duplicates,
      embedding_version: outcome.embeddingVersion,
      took_ms: outcome.tookMs,
    },
  };
}
