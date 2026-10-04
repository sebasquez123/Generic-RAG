import { Injectable } from '@nestjs/common';
import type {
  IngestionFileInput,
  IngestionFormatPort,
} from '~/modules/1_ingestion-api/application/ports/ingestion-format.port';
import {
  DocumentParsingError,
  DomainErrorCodes,
} from '~/modules/1_ingestion-api/domain/errors/domain_errors';
import { normalizeInline } from '~/modules/1_ingestion-api/domain/services/text-normalization';
import { decodeText } from '../text/text-ingestion.adapter';
import {
  DocumentType,
  type ParsedBlock,
  type ParsedDocument,
  type ParsedTableBlock,
} from '~/shared/types/semantic-pipeline.type';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const MAX_DEPTH = 6;

function isRecord(value: Json): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Caller-shaped JSON. Arrays of objects become tables (like spreadsheet rows);
 * everything else becomes `field.path: value` lines grouped by top-level key.
 */
@Injectable()
export class StructuredIngestionAdapter implements IngestionFormatPort {
  readonly type = DocumentType.Json;

  // eslint-disable-next-line @typescript-eslint/require-await -- keeps failures as rejections
  async parse(input: IngestionFileInput): Promise<ParsedDocument> {
    let data: Json;
    try {
      data = JSON.parse(decodeText(input.buffer).text) as Json;
    } catch (error) {
      throw new DocumentParsingError(
        DomainErrorCodes.JSON_INVALID,
        `Invalid JSON in ${input.fileName}: ${(error as Error).message}`,
      );
    }

    const blocks: ParsedBlock[] = [];
    if (this.isRecordArray(data)) {
      blocks.push(this.toTable(data, undefined, 0));
    } else if (isRecord(data)) {
      for (const [key, value] of Object.entries(data)) {
        if (this.isRecordArray(value)) {
          blocks.push(this.toTable(value, key, blocks.length));
          continue;
        }
        const lines = this.flatten(value, key);
        if (lines.length) {
          blocks.push({ kind: 'heading', text: key, level: 1 });
          blocks.push({ kind: 'text', text: lines.join('\n') });
        }
      }
    } else {
      blocks.push({ kind: 'text', text: this.flatten(data, '').join('\n') });
    }

    return {
      type: this.type,
      blocks: blocks.filter(
        (block) => block.kind !== 'text' || block.text.trim(),
      ),
      warnings: [],
      info: {
        parser: 'json',
        root: Array.isArray(data) ? 'array' : typeof data,
        tables: blocks.filter((block) => block.kind === 'table').length,
      },
    };
  }

  private isRecordArray(value: Json): value is { [key: string]: Json }[] {
    return Array.isArray(value) && value.length > 0 && value.every(isRecord);
  }

  private toTable(
    records: { [key: string]: Json }[],
    name: string | undefined,
    tableIndex: number,
  ): ParsedTableBlock {
    const flatRecords = records.map((record) => this.flattenRecord(record));
    const headers = [
      ...new Set(flatRecords.flatMap((record) => Object.keys(record))),
    ];
    return {
      kind: 'table',
      sheet: name,
      tableIndex,
      headers,
      headerSource: 'detected',
      rows: flatRecords.map((record, index) => ({
        rowNumber: index + 1,
        cells: headers.map((header) => record[header] ?? ''),
      })),
    };
  }

  private flattenRecord(record: {
    [key: string]: Json;
  }): Record<string, string> {
    const flat: Record<string, string> = {};
    for (const line of this.flattenPairs(record, '', 0))
      flat[line.path] = line.value;
    return flat;
  }

  private flatten(value: Json, path: string): string[] {
    return this.flattenPairs(value, path, 0).map((pair) =>
      pair.path ? `${pair.path}: ${pair.value}` : pair.value,
    );
  }

  private flattenPairs(
    value: Json,
    path: string,
    depth: number,
  ): { path: string; value: string }[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value) && !isRecord(value)) {
      const text = normalizeInline(String(value));
      return text ? [{ path, value: text }] : [];
    }
    if (depth >= MAX_DEPTH) return [{ path, value: JSON.stringify(value) }];

    if (Array.isArray(value)) {
      if (value.every((item) => !Array.isArray(item) && !isRecord(item)))
        return [{ path, value: value.map((item) => String(item)).join(', ') }];
      return value.flatMap((item, index) =>
        this.flattenPairs(item, `${path}[${index}]`, depth + 1),
      );
    }
    return Object.entries(value).flatMap(([key, child]) =>
      this.flattenPairs(child, path ? `${path}.${key}` : key, depth + 1),
    );
  }
}
