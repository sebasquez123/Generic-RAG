/** Parser-agnostic normalisation and structure heuristics. */

// C0/C1 control characters except tab and newline, plus zero-width marks.
const CONTROL_CHARS =
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeInline(text: string): string {
  return normalizeText(text).replace(/\s+/g, ' ');
}

const MARKDOWN_HEADING = /^(#{1,6})\s+(.+?)\s*#*$/;
const NUMBERED_HEADING = /^(\d+(?:\.\d+){0,3})\.?\s+(\p{Lu}.*)$/u;

export interface DetectedHeading {
  text: string;
  level: number;
}

/**
 * Conservative heading detection. A false positive only adds a section label
 * (the text itself is kept in the chunk), so precision beats recall here.
 */
export function detectHeading(
  line: string,
  options: { markdown: boolean },
): DetectedHeading | undefined {
  const text = line.trim();
  if (!text || text.length > 100) return undefined;

  if (options.markdown) {
    const markdown = MARKDOWN_HEADING.exec(text);
    if (markdown) return { text: markdown[2], level: markdown[1].length };
  }

  if (/[.,;:]$/.test(text)) return undefined;
  const words = text.split(/\s+/).length;

  const numbered = NUMBERED_HEADING.exec(text);
  if (numbered && words <= 12) {
    const depth = numbered[1].split('.').length;
    // "1. Buy milk" is usually a list item; single-level numbers must be short.
    if (depth > 1 || words <= 6) return { text, level: depth };
  }

  const letters = text.match(/\p{L}/gu) ?? [];
  const upper = text.match(/\p{Lu}/gu) ?? [];
  if (
    letters.length >= 4 &&
    words <= 12 &&
    upper.length / letters.length >= 0.9
  )
    return { text, level: 1 };

  return undefined;
}

export function isBulletLine(line: string): boolean {
  return /^([-•*▪◦·‣]|\(?([a-z]|\d{1,3})[).])\s+/iu.test(line);
}

export function endsSentence(line: string): boolean {
  return /[.!?:;…]["'”»)]?$/.test(line);
}
