/**
 * Lexical normalisation shared by indexing (search_tsv) and querying, so both
 * sides always agree. Kept in the application instead of Postgres extensions
 * (unaccent, custom dictionaries) so it is deterministic, testable and needs
 * nothing beyond the built-in 'simple' text-search config.
 *
 * - accents are folded and text lower-cased ("Facturación" -> "facturacion");
 * - tokens are split on anything that is not a letter or a digit;
 * - identifiers written with separators also get a compact form, so
 *   "FV-2025-00123", "fv 2025 00123" and "FV202500123" all match
 *   ("fv202500123"), as do "900.123.456" and "900123456".
 */

// Function words only: they never make a chunk more relevant.
const STOPWORDS = new Set(
  (
    'a al ante con como cual cuales cuando de del desde donde e el ella ellos en entre es esta este ' +
    'esto fue ha han hay la las le les lo los mas me mi muy no nos o para pero por que quien se ' +
    'ser si sin sobre son su sus te tiene un una uno unos unas y ya ' +
    'the of and to in is it for on with by an or at as be this that from are was were what which ' +
    'who how when where do does did i me my we our you your'
  ).split(/\s+/),
);

const MAX_QUERY_TERMS = 32;

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Alphanumeric parts of a whitespace token plus its compact identifier form. */
function tokenParts(rawToken: string): { parts: string[]; compact?: string } {
  const parts = fold(rawToken).match(/[\p{L}\p{N}]+/gu) ?? [];
  const compact =
    parts.length > 1 && /\d/.test(rawToken) ? parts.join('') : undefined;
  return { parts, compact };
}

/** Text handed to `to_tsvector('simple', …)` for a chunk. */
export function toIndexText(text: string): string {
  const tokens: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const { parts, compact } = tokenParts(raw);
    tokens.push(...parts);
    if (compact) tokens.push(compact);
  }
  return tokens.join(' ');
}

/** Every token of a text, normalised exactly like the index. */
export function indexTokens(text: string): Set<string> {
  return new Set(toIndexText(text).split(' ').filter(Boolean));
}

export interface QueryTerms {
  /** Normalised, de-duplicated, stop-word free terms (OR-ed in the tsquery). */
  terms: string[];
  /**
   * Terms that must appear verbatim for a chunk to be exact evidence: numbers,
   * codes, ids, dates (anything containing a digit, in compact form).
   */
  identifiers: string[];
}

export function queryTerms(query: string): QueryTerms {
  const terms = new Set<string>();
  const identifiers = new Set<string>();

  for (const raw of query.split(/\s+/)) {
    const { parts, compact } = tokenParts(raw);
    if (compact) {
      terms.add(compact);
      identifiers.add(compact);
    }
    for (const part of parts) {
      const numeric = /\d/.test(part);
      if (STOPWORDS.has(part) || (!numeric && part.length < 2)) continue;
      terms.add(part);
      // A lone multi-digit number ("2025", "00123") is an identifier on its
      // own; parts of a compacted code are represented by the compact form.
      if (numeric && !compact && part.length >= 3) identifiers.add(part);
    }
  }

  return {
    terms: [...terms].slice(0, MAX_QUERY_TERMS),
    identifiers: [...identifiers],
  };
}

/** `to_tsquery('simple', …)` input. Terms are [\p{L}\p{N}]+ only, so it is injection-safe. */
export function toTsQuery(terms: string[]): string | undefined {
  const safe = terms.filter((term) => /^[\p{L}\p{N}]+$/u.test(term));
  return safe.length ? safe.join(' | ') : undefined;
}
