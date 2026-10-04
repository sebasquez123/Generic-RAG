import type { ParsedTableBlock } from '~/shared/types/semantic-pipeline.type';

export interface SheetRow {
  rowNumber: number;
  cells: string[];
}

export function columnLetter(index: number): string {
  let letter = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  return letter;
}

const NUMERIC_LIKE = /^[-+]?[$€£%]?\s?[\d.,]+\s?%?$|^\d{4}-\d{2}-\d{2}/;

function isEmptyRow(row: SheetRow): boolean {
  return row.cells.every((cell) => !cell);
}

function looksLikeHeader(cells: string[]): boolean {
  const filled = cells.filter(Boolean);
  if (filled.length === 0 || filled.length < Math.ceil(cells.length / 2))
    return false;
  if (filled.some((cell) => NUMERIC_LIKE.test(cell) || cell.length > 80))
    return false;
  return (
    new Set(filled.map((cell) => cell.toLowerCase())).size === filled.length
  );
}

function uniqueHeaders(raw: string[], columns: number[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((header, index) => {
    const base = header || `Column ${columnLetter(columns[index])}`;
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

/**
 * Splits a sheet into tables separated by blank rows, removes empty columns,
 * attaches single-cell title rows as captions and detects header rows.
 */
export function buildTableBlocks(
  rows: SheetRow[],
  sheet: string | undefined,
  firstTableIndex = 0,
): ParsedTableBlock[] {
  const groups: SheetRow[][] = [];
  let current: SheetRow[] = [];
  for (const row of rows) {
    if (isEmptyRow(row)) {
      if (current.length) groups.push(current);
      current = [];
    } else current.push(row);
  }
  if (current.length) groups.push(current);

  const tables: ParsedTableBlock[] = [];
  let caption: string | undefined;

  for (const group of groups) {
    let body = group;
    // Leading single-cell rows are titles ("Sales report 2025"), not data.
    while (body.length > 1 && body[0].cells.filter(Boolean).length === 1) {
      caption = [caption, body[0].cells.find(Boolean)]
        .filter(Boolean)
        .join(' - ');
      body = body.slice(1);
    }
    if (body.length === 1 && body[0].cells.filter(Boolean).length === 1) {
      caption = [caption, body[0].cells.find(Boolean)]
        .filter(Boolean)
        .join(' - ');
      continue;
    }

    const width = Math.max(...body.map((row) => row.cells.length));
    const columns = [...Array(width).keys()].filter((column) =>
      body.some((row) => row.cells[column]),
    );
    const project = (row: SheetRow) =>
      columns.map((column) => row.cells[column] ?? '');

    const headerDetected = body.length > 1 && looksLikeHeader(project(body[0]));
    const headers = uniqueHeaders(
      headerDetected ? project(body[0]) : columns.map(() => ''),
      columns,
    );
    const dataRows = (headerDetected ? body.slice(1) : body).map((row) => ({
      rowNumber: row.rowNumber,
      cells: project(row),
    }));

    tables.push({
      kind: 'table',
      sheet,
      tableIndex: firstTableIndex + tables.length,
      caption,
      headers,
      headerSource: headerDetected ? 'detected' : 'generated',
      rows: dataRows,
    });
    caption = undefined;
  }
  return tables;
}
