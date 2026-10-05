import { Inject, Injectable, Optional } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import defaults, { type RagConfig } from '~/config';
import { RAG_CONFIG } from '~/shared/config/rag-config.module';
import type {
  IngestionFileInput,
  IngestionFormatPort,
} from '~/modules/1_ingestion-api/application/ports/ingestion-format.port';
import {
  DocumentParsingError,
  DomainErrorCodes,
} from '~/modules/1_ingestion-api/domain/errors/domain_errors';
import {
  detectHeading,
  endsSentence,
  isBulletLine,
  normalizeInline,
} from '~/modules/1_ingestion-api/domain/services/text-normalization';
import {
  DocumentType,
  type ParsedBlock,
  type ParsedDocument,
} from '~/shared/types/semantic-pipeline.type';

const PAGE_NUMBER_LINE =
  /^((page|p[aá]gina|p[aá]g\.?)\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?(\s*(of|de|\/)\s*\d{1,4})?$/i;

@Injectable()
export class PdfIngestionAdapter implements IngestionFormatPort {
  readonly type = DocumentType.Pdf;
  private readonly maxPages: number;

  constructor(@Optional() @Inject(RAG_CONFIG) config?: RagConfig) {
    this.maxPages = (config ?? defaults.rag).limits.pdfMaxPages;
  }

  async parse(input: IngestionFileInput): Promise<ParsedDocument> {
    const { pages, info } = await this.extract(input.buffer);
    const lineSets = pages.map((page) =>
      page.text.split('\n').map(normalizeInline).filter(Boolean),
    );
    const repeated = this.repeatedLines(lineSets);
    const warnings: string[] = [];
    const blocks: ParsedBlock[] = [];
    let emptyPages = 0;

    pages.forEach((page, index) => {
      const lines = lineSets[index].filter((line, position, all) => {
        const atEdge = position < 3 || position >= all.length - 3;
        if (atEdge && PAGE_NUMBER_LINE.test(line)) return false;
        return !(atEdge && repeated.has(this.lineKey(line)));
      });
      if (lines.length === 0) emptyPages += 1;
      blocks.push(...this.toBlocks(lines, page.num));
    });

    if (!blocks.some((block) => block.kind === 'text'))
      throw new DocumentParsingError(
        DomainErrorCodes.PDF_NO_TEXT,
        `No extractable text in ${input.fileName}. Scanned/image-only PDFs need OCR, which is not supported.`,
      );
    if (emptyPages > 0)
      warnings.push(
        `${emptyPages} page(s) had no extractable text (images or scans?)`,
      );
    if (repeated.size > 0)
      warnings.push(
        `Removed ${repeated.size} repeated header/footer line pattern(s)`,
      );

    const title = this.meaningful(info.Title);
    return {
      type: this.type,
      title,
      blocks,
      warnings,
      info: {
        parser: 'pdf-parse',
        page_count: pages.length,
        pages_without_text: emptyPages,
        title,
        author: this.meaningful(info.Author),
        creator: this.meaningful(info.Creator),
        producer: this.meaningful(info.Producer),
      },
    };
  }

  private async extract(buffer: Buffer) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      // Page count first: text extraction of a huge PDF is the expensive part.
      const details = await parser.getInfo().catch(() => undefined);
      if (details && details.total > this.maxPages)
        throw new DocumentParsingError(
          DomainErrorCodes.PDF_TOO_LARGE,
          `The PDF has ${details.total} pages (limit ${this.maxPages}, RAG_PDF_MAX_PAGES)`,
        );
      const text = await parser.getText();
      return {
        pages: text.pages,
        info: (details?.info ?? {}) as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof DocumentParsingError) throw error;
      const name = (error as Error)?.name ?? '';
      if (
        /password/i.test(name) ||
        /password/i.test((error as Error)?.message ?? '')
      )
        throw new DocumentParsingError(
          DomainErrorCodes.PDF_ENCRYPTED,
          'The PDF is password protected',
        );
      throw new DocumentParsingError(
        DomainErrorCodes.PDF_INVALID,
        `The PDF could not be read: ${(error as Error)?.message ?? 'unknown error'}`,
      );
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  /** Rebuilds paragraphs from visual lines and detects headings. */
  private toBlocks(lines: string[], page: number): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    const lengths = lines.map((line) => line.length).sort((a, b) => a - b);
    const typicalLength = lengths[Math.floor(lengths.length * 0.75)] ?? 0;
    let paragraph: string[] = [];

    const flush = () => {
      if (paragraph.length)
        blocks.push({ kind: 'text', text: this.joinLines(paragraph), page });
      paragraph = [];
    };

    for (const line of lines) {
      const heading = detectHeading(line, { markdown: false });
      if (heading && paragraph.length === 0) {
        blocks.push({
          kind: 'heading',
          text: heading.text,
          level: heading.level,
          page,
        });
        continue;
      }
      if (heading || isBulletLine(line)) flush();
      paragraph.push(line);
      // A short line that closes a sentence usually ends the paragraph.
      if (endsSentence(line) && line.length < typicalLength * 0.8) flush();
    }
    flush();
    return blocks;
  }

  private joinLines(lines: string[]): string {
    return lines.reduce((text, line) => {
      if (!text) return line;
      // Re-join words hyphenated at the end of a line: "infor-" + "mación".
      if (/\p{L}-$/u.test(text) && /^\p{Ll}/u.test(line))
        return text.slice(0, -1) + line;
      return `${text} ${line}`;
    }, '');
  }

  /** Header/footer lines repeated on most pages (digits ignored). */
  private repeatedLines(pages: string[][]): Set<string> {
    const repeated = new Set<string>();
    if (pages.length < 3) return repeated;

    const counts = new Map<string, number>();
    for (const lines of pages) {
      const unique = new Set(
        [...lines.slice(0, 3), ...lines.slice(-3)]
          .filter((line) => line.length <= 120)
          .map((line) => this.lineKey(line)),
      );
      unique.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
    }
    const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
    counts.forEach((count, key) => count >= threshold && repeated.add(key));
    return repeated;
  }

  private lineKey(line: string): string {
    return line.replace(/\d+/g, '#').toLowerCase();
  }

  private meaningful(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const text = value.trim();
    return text && !/^untitled$/i.test(text) ? text : undefined;
  }
}
