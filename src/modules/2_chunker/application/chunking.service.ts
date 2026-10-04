import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RagConfig } from '~/config';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import {
  ChunkType,
  ChunkingStrategy,
  type ChunkDraft,
  type ChunkingDescriptor,
  type ChunkingOptions,
  type ParsedDocument,
  type ParsedTableBlock,
} from '~/shared/types/semantic-pipeline.type';
import {
  explodeText,
  hasMeaningfulContent,
  packUnits,
  renderUnits,
  type TextUnit,
} from '../domain/text-units';
import { InvalidChunkingOptionsError } from '../domain/error/domain_errors';

/**
 * Bump whenever chunk boundaries, chunk rendering or the embedding input
 * format change: documents chunked with another version need re-ingestion.
 */
export const CHUNKING_VERSION = 'chunker-v1';

type Draft = Omit<ChunkDraft, 'chunkIndex' | 'contentHash'>;

interface Heading {
  text: string;
  level: number;
}

interface SectionParagraph {
  text: string;
  page?: number;
  isHeading?: boolean;
}

const MAX_COLUMNS_IN_METADATA = 50;

@Injectable()
export class ChunkingService {
  constructor(@Inject(RAG_CONFIG) private readonly config: RagConfig) {}

  resolveOptions(overrides: Partial<ChunkingOptions> = {}): ChunkingDescriptor {
    const defaults = this.config.chunking;
    const options: ChunkingOptions = {
      strategy: overrides.strategy ?? ChunkingStrategy.Auto,
      chunkSize: overrides.chunkSize ?? defaults.chunkSize,
      chunkOverlap: overrides.chunkOverlap ?? defaults.chunkOverlap,
      minChunkChars: overrides.minChunkChars ?? defaults.minChunkChars,
      tableMaxRowsPerChunk:
        overrides.tableMaxRowsPerChunk ?? defaults.tableMaxRowsPerChunk,
    };

    if (options.chunkSize < 200 || options.chunkSize > 8000)
      throw new InvalidChunkingOptionsError(
        'chunk_size must be between 200 and 8000',
      );
    if (
      options.chunkOverlap < 0 ||
      options.chunkOverlap > options.chunkSize / 2
    )
      throw new InvalidChunkingOptionsError(
        'chunk_overlap must be between 0 and half of chunk_size',
      );
    if (options.tableMaxRowsPerChunk < 1 || options.tableMaxRowsPerChunk > 500)
      throw new InvalidChunkingOptionsError(
        'table_max_rows_per_chunk must be between 1 and 500',
      );

    return { ...options, version: CHUNKING_VERSION };
  }

  chunk(document: ParsedDocument, options: ChunkingOptions): ChunkDraft[] {
    const drafts: Draft[] = [];
    const headings: Heading[] = [];
    let paragraphs: SectionParagraph[] = [];

    const flushSection = () => {
      // A heading followed by nothing is kept only as part of the heading path.
      const hasBody = paragraphs.some((p, index) => index > 0 || !p.isHeading);
      if (paragraphs.length && hasBody)
        drafts.push(...this.chunkProse(paragraphs, [...headings], options));
      paragraphs = [];
    };

    for (const block of document.blocks) {
      if (block.kind === 'heading') {
        flushSection();
        while (headings.length && headings.at(-1)!.level >= block.level)
          headings.pop();
        headings.push({ text: block.text, level: block.level });
        paragraphs.push({
          text: block.text,
          page: block.page,
          isHeading: true,
        });
      } else if (block.kind === 'text') {
        paragraphs.push({ text: block.text, page: block.page });
      } else {
        flushSection();
        drafts.push(...this.chunkTable(block, options));
      }
    }
    flushSection();

    return this.finalize(drafts);
  }

  /** Text sent to the embedding model: structural context + original content. */
  buildEmbeddingInput(documentLabel: string, chunk: ChunkDraft): string {
    const header = [
      `Document: ${documentLabel}`,
      chunk.sheet ? `Sheet: ${chunk.sheet}` : undefined,
      chunk.section ? `Section: ${chunk.section}` : undefined,
    ].filter(Boolean);
    return `${header.join('\n')}\n\n${chunk.content}`;
  }

  // ------------------------------------------------------------------ prose

  private chunkProse(
    paragraphs: SectionParagraph[],
    headings: Heading[],
    options: ChunkingOptions,
  ): Draft[] {
    const units: TextUnit[] = paragraphs.flatMap((paragraph) =>
      explodeText(paragraph.text, options.chunkSize, '\n\n', paragraph.page),
    );
    const packed = this.mergeTinyTail(
      packUnits(units, options.chunkSize, options.chunkOverlap),
      options,
    );
    const section = headings.at(-1)?.text;

    return packed.map((chunkUnits) => {
      const pages = chunkUnits
        .map((unit) => unit.page)
        .filter((page): page is number => page !== undefined);
      const content = renderUnits(chunkUnits);
      return {
        chunkType: ChunkType.Text,
        content,
        pageStart: pages.length ? Math.min(...pages) : undefined,
        pageEnd: pages.length ? Math.max(...pages) : undefined,
        section,
        metadata: {
          heading_path: headings.map((heading) => heading.text),
          char_count: content.length,
        },
      };
    });
  }

  /** Folds a too-small last chunk into the previous one when there is room. */
  private mergeTinyTail(chunks: TextUnit[][], options: ChunkingOptions) {
    if (chunks.length < 2) return chunks;
    const last = chunks.at(-1)!;
    const previous = chunks.at(-2)!;
    const lastLength = renderUnits(last).length;
    if (lastLength >= options.minChunkChars) return chunks;

    const fresh = last.filter((unit) => !previous.includes(unit));
    const merged = [...previous, ...fresh];
    if (renderUnits(merged).length > options.chunkSize * 1.25) return chunks;
    return [...chunks.slice(0, -2), merged];
  }

  // ----------------------------------------------------------------- tables

  private chunkTable(
    table: ParsedTableBlock,
    options: ChunkingOptions,
  ): Draft[] {
    if (table.rows.length === 0) return [];
    const lines = table.rows
      .map((row) => ({
        rowNumber: row.rowNumber,
        text: this.renderRow(table.headers, row.cells),
      }))
      .filter((line) => line.text.length > 0);
    if (lines.length === 0) return [];

    const columns = table.headers.slice(0, MAX_COLUMNS_IN_METADATA);
    const baseMetadata = {
      table_index: table.tableIndex,
      columns,
      header_source: table.headerSource,
    };

    if (options.strategy === ChunkingStrategy.Recursive)
      return this.chunkProse(
        lines.map((line) => ({ text: `Row ${line.rowNumber}: ${line.text}` })),
        [],
        options,
      ).map((draft) => ({
        ...draft,
        sheet: table.sheet,
        section: table.caption,
      }));

    const firstRow = lines[0].rowNumber;
    const lastRow = lines.at(-1)!.rowNumber;
    const drafts: Draft[] = [
      {
        chunkType: ChunkType.TableSummary,
        sheet: table.sheet,
        section: table.caption,
        content:
          `Table${table.caption ? ` "${table.caption}"` : ''}` +
          `${table.sheet ? ` in sheet "${table.sheet}"` : ''} with ${lines.length} data rows ` +
          `(rows ${firstRow}-${lastRow}). Columns: ${table.headers.join(', ')}.`,
        metadata: {
          ...baseMetadata,
          row_start: firstRow,
          row_end: lastRow,
          row_count: lines.length,
        },
      },
    ];

    let group: typeof lines = [];
    const flush = () => {
      if (!group.length) return;
      drafts.push({
        chunkType: ChunkType.TableRows,
        sheet: table.sheet,
        section: table.caption,
        content: group
          .map((line) => `Row ${line.rowNumber}: ${line.text}`)
          .join('\n'),
        metadata: {
          ...baseMetadata,
          row_start: group[0].rowNumber,
          row_end: group.at(-1)!.rowNumber,
          row_count: group.length,
        },
      });
      group = [];
    };

    for (const line of lines) {
      const length = group.reduce(
        (total, item) => total + item.text.length + 12,
        0,
      );
      if (
        group.length >= options.tableMaxRowsPerChunk ||
        (group.length && length + line.text.length > options.chunkSize)
      )
        flush();
      group.push(line);
    }
    flush();
    return drafts;
  }

  private renderRow(headers: string[], cells: string[]): string {
    return cells
      .map((cell, index) =>
        cell ? `${headers[index] ?? `Column ${index + 1}`}: ${cell}` : '',
      )
      .filter(Boolean)
      .join(' | ');
  }

  // --------------------------------------------------------------- finalize

  /** Drops empty and duplicated content, then assigns stable indexes. */
  private finalize(drafts: Draft[]): ChunkDraft[] {
    const seen = new Set<string>();
    const chunks: ChunkDraft[] = [];

    for (const draft of drafts) {
      const content = draft.content.trim();
      if (!hasMeaningfulContent(content)) continue;
      const contentHash = createHash('sha256').update(content).digest('hex');
      if (seen.has(contentHash)) continue;
      seen.add(contentHash);
      chunks.push({
        ...draft,
        content,
        contentHash,
        chunkIndex: chunks.length,
      });
    }
    return chunks;
  }
}
