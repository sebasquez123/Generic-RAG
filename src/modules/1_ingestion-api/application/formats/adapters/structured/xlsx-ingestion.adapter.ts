import { Inject, Injectable, Optional } from '@nestjs/common';
import ExcelJS from 'exceljs';
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
import { normalizeInline } from '~/modules/1_ingestion-api/domain/services/text-normalization';
import {
  buildTableBlocks,
  type SheetRow,
} from '~/modules/1_ingestion-api/domain/services/table-structure';
import { inspectZip } from '~/modules/1_ingestion-api/domain/services/zip-inspection';
import {
  DocumentType,
  type ParsedBlock,
  type ParsedDocument,
} from '~/shared/types/semantic-pipeline.type';

const CURRENCY = /\[\$([^\]-]+)[^\]]*\]|([$€£¥])/;

@Injectable()
export class XlsxIngestionAdapter implements IngestionFormatPort {
  readonly type = DocumentType.Xlsx;
  private readonly limits: RagConfig['limits'];

  constructor(@Optional() @Inject(RAG_CONFIG) config?: RagConfig) {
    this.limits = (config ?? defaults.rag).limits;
  }

  async parse(input: IngestionFileInput): Promise<ParsedDocument> {
    this.assertInflatedSize(input);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(input.buffer as unknown as ExcelJS.Buffer);
    } catch (error) {
      throw new DocumentParsingError(
        DomainErrorCodes.XLSX_INVALID,
        `The workbook could not be read: ${(error as Error)?.message ?? 'unknown error'}`,
      );
    }

    const blocks: ParsedBlock[] = [];
    const sheets: Record<string, unknown>[] = [];
    const warnings: string[] = [];
    let cellCount = 0;

    for (const worksheet of workbook.worksheets) {
      const hidden = worksheet.state !== 'visible';
      // Hidden sheets are often scratch data or deliberately hidden from
      // readers: never expose them unless explicitly enabled.
      if (hidden && !this.limits.xlsxIncludeHiddenSheets) {
        sheets.push({
          name: worksheet.name,
          state: worksheet.state,
          skipped: true,
        });
        warnings.push(
          `Sheet "${worksheet.name}" is ${worksheet.state} and was skipped (RAG_XLSX_INCLUDE_HIDDEN_SHEETS=true to ingest it)`,
        );
        continue;
      }

      // Only cells with values are visited: formatted-but-empty ranges can make
      // rowCount/columnCount enormous. Skipped rows become blank separators.
      const rows: SheetRow[] = [];
      let previousRow = 0;
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > previousRow + 1)
          rows.push({ rowNumber: rowNumber - 1, cells: [] });
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, column) => {
          cellCount += 1;
          cells[column - 1] = this.cellText(cell.value, cell.numFmt);
        });
        if (cellCount > this.limits.xlsxMaxCells)
          throw new DocumentParsingError(
            DomainErrorCodes.XLSX_TOO_LARGE,
            `The workbook has more than ${this.limits.xlsxMaxCells} non-empty cells (RAG_XLSX_MAX_CELLS)`,
          );
        rows.push({
          rowNumber,
          cells: Array.from(cells, (cell) => cell ?? ''),
        });
        previousRow = rowNumber;
      });

      const tables = buildTableBlocks(rows, worksheet.name, blocks.length);
      blocks.push(...tables);
      sheets.push({
        name: worksheet.name,
        state: worksheet.state,
        row_count: worksheet.actualRowCount,
        column_count: worksheet.actualColumnCount,
        tables: tables.length,
      });
      if (hidden)
        warnings.push(
          `Sheet "${worksheet.name}" is ${worksheet.state} but was ingested`,
        );
    }

    if (
      !blocks.some((block) => block.kind === 'table' && block.rows.length > 0)
    )
      throw new DocumentParsingError(
        DomainErrorCodes.XLSX_EMPTY,
        `The workbook ${input.fileName} has no data rows`,
      );

    return {
      type: this.type,
      title: workbook.title || undefined,
      blocks,
      warnings,
      info: {
        parser: 'exceljs',
        sheet_count: workbook.worksheets.length,
        cell_count: cellCount,
        sheets,
        creator: workbook.creator || undefined,
      },
    };
  }

  /** Rejects workbooks whose XML would not fit comfortably in memory. */
  private assertInflatedSize(input: IngestionFileInput) {
    const zip = inspectZip(input.buffer);
    const limit = this.limits.xlsxMaxUncompressedBytes;
    if (zip && (zip.zip64 || zip.uncompressedBytes > limit))
      throw new DocumentParsingError(
        DomainErrorCodes.XLSX_TOO_LARGE,
        `The workbook ${input.fileName} expands to ${
          zip.zip64 ? 'more than 4 GB' : `${zip.uncompressedBytes} bytes`
        } (limit ${limit}, RAG_XLSX_MAX_UNCOMPRESSED_BYTES)`,
      );
  }

  /**
   * Displayable value of a cell: formulas give their result, dates ISO
   * strings, and percentage/currency formats are kept ("15%", "$1250000")
   * because 0.15 or a bare number would change the meaning of the evidence.
   */
  private cellText(value: ExcelJS.CellValue, numFmt?: string): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return this.formatDate(value);
    if (typeof value === 'number') return this.formatNumber(value, numFmt);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'string') return normalizeInline(value);

    if ('richText' in value)
      return normalizeInline(value.richText.map((part) => part.text).join(''));
    if ('formula' in value || 'sharedFormula' in value)
      return this.cellText(
        (value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue,
        numFmt,
      );
    if ('hyperlink' in value)
      return normalizeInline(String(value.text ?? value.hyperlink));
    // Error cells (#DIV/0!, #N/A) carry no retrievable information.
    if ('error' in value) return '';
    return '';
  }

  private formatNumber(value: number, numFmt?: string): string {
    const plain = (n: number) =>
      Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
    // Only the positive section matters ("0.00%;[Red]-0.00%").
    const format = numFmt?.split(';')[0] ?? '';
    if (!format || format === 'General') return plain(value);

    if (format.includes('%')) {
      const decimals = /\.(0+)/.exec(format)?.[1].length ?? 0;
      return `${(value * 100).toFixed(decimals)}%`;
    }
    const currency = CURRENCY.exec(format);
    if (currency) {
      // Digits stay unformatted (no locale-dependent separators).
      const symbol = currency[1] ? `${currency[1].trim()} ` : currency[2];
      return `${value < 0 ? '-' : ''}${symbol}${plain(Math.abs(value))}`;
    }
    return plain(value);
  }

  private formatDate(date: Date): string {
    const iso = date.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19);
  }
}
