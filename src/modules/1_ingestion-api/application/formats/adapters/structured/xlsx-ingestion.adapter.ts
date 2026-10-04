import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
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
import {
  DocumentType,
  type ParsedBlock,
  type ParsedDocument,
} from '~/shared/types/semantic-pipeline.type';

@Injectable()
export class XlsxIngestionAdapter implements IngestionFormatPort {
  readonly type = DocumentType.Xlsx;

  async parse(input: IngestionFileInput): Promise<ParsedDocument> {
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

    for (const worksheet of workbook.worksheets) {
      // Only cells with values are visited: formatted-but-empty ranges can make
      // rowCount/columnCount enormous. Skipped rows become blank separators.
      const rows: SheetRow[] = [];
      let previousRow = 0;
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > previousRow + 1)
          rows.push({ rowNumber: rowNumber - 1, cells: [] });
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, column) => {
          cells[column - 1] = this.cellText(cell.value);
        });
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
      if (worksheet.state !== 'visible')
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
        sheets,
        creator: workbook.creator || undefined,
      },
    };
  }

  /** Displayable value of a cell: formulas give their result, dates ISO strings. */
  private cellText(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return this.formatDate(value);
    if (typeof value === 'number')
      return Number.isInteger(value)
        ? String(value)
        : String(Number(value.toPrecision(12)));
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (typeof value === 'string') return normalizeInline(value);

    if ('richText' in value)
      return normalizeInline(value.richText.map((part) => part.text).join(''));
    if ('formula' in value || 'sharedFormula' in value)
      return this.cellText(
        (value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue,
      );
    if ('hyperlink' in value)
      return normalizeInline(String(value.text ?? value.hyperlink));
    // Error cells (#DIV/0!, #N/A) carry no retrievable information.
    if ('error' in value) return '';
    return '';
  }

  private formatDate(date: Date): string {
    const iso = date.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19);
  }
}
