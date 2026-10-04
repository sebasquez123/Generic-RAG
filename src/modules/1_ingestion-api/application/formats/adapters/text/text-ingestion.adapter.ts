import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
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
  normalizeText,
} from '~/modules/1_ingestion-api/domain/services/text-normalization';
import {
  DocumentType,
  type ParsedBlock,
  type ParsedDocument,
} from '~/shared/types/semantic-pipeline.type';

export interface DecodedText {
  text: string;
  encoding: string;
}

/** BOM first, then strict UTF-8, then Windows-1252 (the usual legacy export). */
export function decodeText(buffer: Buffer): DecodedText {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf)
    return {
      text: new TextDecoder('utf-8').decode(buffer.subarray(3)),
      encoding: 'utf-8-bom',
    };
  if (buffer[0] === 0xff && buffer[1] === 0xfe)
    return {
      text: new TextDecoder('utf-16le').decode(buffer.subarray(2)),
      encoding: 'utf-16le',
    };
  if (buffer[0] === 0xfe && buffer[1] === 0xff)
    return {
      text: new TextDecoder('utf-16be').decode(buffer.subarray(2)),
      encoding: 'utf-16be',
    };

  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      encoding: 'utf-8',
    };
  } catch {
    return {
      text: new TextDecoder('windows-1252').decode(buffer),
      encoding: 'windows-1252',
    };
  }
}

@Injectable()
export class TextIngestionAdapter implements IngestionFormatPort {
  readonly type = DocumentType.Txt;

  // eslint-disable-next-line @typescript-eslint/require-await -- keeps failures as rejections
  async parse(input: IngestionFileInput): Promise<ParsedDocument> {
    const { text: raw, encoding } = decodeText(input.buffer);
    const text = normalizeText(raw);
    if (!/[\p{L}\p{N}]/u.test(text))
      throw new DocumentParsingError(
        DomainErrorCodes.TEXT_EMPTY,
        `The text file ${input.fileName} has no readable content`,
      );

    const extension = extname(input.fileName).toLowerCase();
    const markdown =
      extension === '.md' ||
      extension === '.markdown' ||
      /^#{1,6}\s/m.test(text);
    const blocks = this.toBlocks(text, markdown);
    const firstHeading = blocks.find((block) => block.kind === 'heading');

    return {
      type: this.type,
      title:
        markdown && firstHeading?.kind === 'heading'
          ? firstHeading.text
          : undefined,
      blocks,
      warnings:
        encoding === 'windows-1252'
          ? ['File was not valid UTF-8; decoded as Windows-1252']
          : [],
      info: {
        parser: 'text',
        encoding,
        markdown,
        line_count: text.split('\n').length,
        char_count: text.length,
      },
    };
  }

  private toBlocks(text: string, markdown: boolean): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    for (const paragraph of text.split(/\n\s*\n/)) {
      const lines = paragraph.split('\n');
      // A heading may open a paragraph without a blank line after it.
      const heading = detectHeading(lines[0], { markdown });
      if (heading && (lines.length === 1 || markdown)) {
        blocks.push({
          kind: 'heading',
          text: heading.text,
          level: heading.level,
        });
        const rest = lines.slice(1).join('\n').trim();
        if (rest) blocks.push({ kind: 'text', text: rest });
      } else {
        blocks.push({ kind: 'text', text: paragraph.trim() });
      }
    }
    return blocks.filter(
      (block) => block.kind === 'table' || block.text.length > 0,
    );
  }
}
