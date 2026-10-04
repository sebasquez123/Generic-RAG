/**
 * Pure helpers for boundary-aware splitting. A "unit" is the smallest piece the
 * packer may place in a chunk; units are never cut unless a single word is
 * longer than the chunk size.
 */
export interface TextUnit {
  text: string;
  /** Whitespace placed before the unit when it is not first in a chunk. */
  joiner: string;
  page?: number;
}

// Coarse -> fine boundaries: line breaks, sentence ends, words.
const LEVELS: RegExp[] = [/(\n+)/, /(?<=[.!?…])(\s+)/, /(\s+)/];

function normalizeJoiner(separator: string): string {
  return separator.includes('\n') ? '\n' : ' ';
}

/** Splits `text` into units no longer than `maxLength`, keeping the boundaries. */
export function explodeText(
  text: string,
  maxLength: number,
  joiner: string,
  page?: number,
  level = 0,
): TextUnit[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLength) return [{ text: trimmed, joiner, page }];

  if (level >= LEVELS.length) {
    const slices: TextUnit[] = [];
    for (let start = 0; start < trimmed.length; start += maxLength)
      slices.push({
        text: trimmed.slice(start, start + maxLength),
        joiner: start === 0 ? joiner : '',
        page,
      });
    return slices;
  }

  const parts = trimmed.split(LEVELS[level]);
  if (parts.length === 1)
    return explodeText(trimmed, maxLength, joiner, page, level + 1);

  const units: TextUnit[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const separator = index === 0 ? joiner : normalizeJoiner(parts[index - 1]);
    const exploded = explodeText(
      parts[index],
      maxLength,
      separator,
      page,
      level + 1,
    );
    units.push(...exploded);
  }
  if (units.length > 0) units[0] = { ...units[0], joiner };
  return units;
}

export function renderUnits(units: TextUnit[]): string {
  return units
    .map((unit, index) => (index === 0 ? unit.text : unit.joiner + unit.text))
    .join('');
}

/** Tail of a chunk reused at the start of the next one (never mid-word). */
function overlapTail(units: TextUnit[], overlap: number): TextUnit[] {
  if (overlap <= 0) return [];
  const tail: TextUnit[] = [];
  let length = 0;

  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    const added = unit.text.length + (tail.length ? tail[0].joiner.length : 0);
    if (length + added > overlap) break;
    tail.unshift(unit);
    length += added;
  }
  if (tail.length > 0) return tail;

  // Last unit alone is longer than the overlap: keep its trailing words.
  const last = units.at(-1);
  if (!last) return [];
  const words = last.text.split(/\s+/);
  const kept: string[] = [];
  for (let index = words.length - 1; index > 0; index -= 1) {
    const candidate = [words[index], ...kept].join(' ');
    if (candidate.length > overlap) break;
    kept.unshift(words[index]);
  }
  return kept.length
    ? [{ text: kept.join(' '), joiner: ' ', page: last.page }]
    : [];
}

/** Greedy packing of units into chunks of at most `chunkSize` characters. */
export function packUnits(
  units: TextUnit[],
  chunkSize: number,
  overlap: number,
): TextUnit[][] {
  const chunks: TextUnit[][] = [];
  let current: TextUnit[] = [];

  const lengthWith = (unit: TextUnit) =>
    renderUnits(current).length +
    (current.length ? unit.joiner.length : 0) +
    unit.text.length;

  for (const unit of units) {
    if (current.length && lengthWith(unit) > chunkSize) {
      chunks.push(current);
      current = overlapTail(current, overlap);
      while (current.length && lengthWith(unit) > chunkSize) current.shift();
    }
    current.push(unit);
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function hasMeaningfulContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}
