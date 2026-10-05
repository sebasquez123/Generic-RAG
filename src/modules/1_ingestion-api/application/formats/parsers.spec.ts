import {
  buildPdf,
  buildSalesWorkbook,
  HANDBOOK_TXT,
  REPORT_PDF_PAGES,
} from '../../../../../test/support/fixtures';
import { DomainErrorCodes } from '../../domain/errors/domain_errors';
import { PdfIngestionAdapter } from './adapters/pdf/pdf-ingestion.adapter';
import { StructuredIngestionAdapter } from './adapters/structured/structured-ingestion.adapter';
import { XlsxIngestionAdapter } from './adapters/structured/xlsx-ingestion.adapter';
import {
  TextIngestionAdapter,
  decodeText,
} from './adapters/text/text-ingestion.adapter';
import ExcelJS from 'exceljs';
import config, { type RagConfig } from '~/config';
import type {
  ParsedHeadingBlock,
  ParsedTableBlock,
} from '~/shared/types/semantic-pipeline.type';

const withLimits = (limits: Partial<RagConfig['limits']>) =>
  ({ ...config.rag, limits: { ...config.rag.limits, ...limits } }) as RagConfig;

describe('PdfIngestionAdapter', () => {
  const adapter = new PdfIngestionAdapter();

  it('refuses PDFs above the page limit before extracting their text', async () => {
    await expect(
      new PdfIngestionAdapter(withLimits({ pdfMaxPages: 2 })).parse({
        buffer: buildPdf(REPORT_PDF_PAGES),
        fileName: 'largo.pdf',
      }),
    ).rejects.toMatchObject({ code: DomainErrorCodes.PDF_TOO_LARGE });
  });

  it('keeps pages and headings and removes repeated headers and page numbers', async () => {
    const parsed = await adapter.parse({
      buffer: buildPdf(REPORT_PDF_PAGES, { title: 'Informe anual ACME' }),
      fileName: 'informe.pdf',
    });

    expect(parsed.title).toBe('Informe anual ACME');
    expect(parsed.info).toMatchObject({ page_count: 3, parser: 'pdf-parse' });

    const headings = parsed.blocks.filter(
      (block) => block.kind === 'heading',
    ) as ParsedHeadingBlock[];
    expect(headings.map((heading) => heading.text)).toEqual([
      '1. RESUMEN EJECUTIVO',
      '2. POLÍTICA DE VACACIONES',
      '3. SEGURIDAD DE LA INFORMACIÓN',
      '4. INFRAESTRUCTURA',
    ]);

    const text = parsed.blocks
      .map((block) => ('text' in block ? block.text : ''))
      .join('\n');
    expect(text).not.toContain('Informe confidencial');
    expect(text).not.toMatch(/Página \d de 3/);

    const security = parsed.blocks.find(
      (block) =>
        block.kind === 'text' && block.text.includes('cifrado de disco'),
    );
    expect(security).toMatchObject({ page: 2 });
    // Visual lines of one paragraph are joined back together.
    expect(security?.kind === 'text' ? security.text : '').toContain(
      'autenticación multifactor',
    );
  });

  it('fails with PDF_NO_TEXT for a PDF without extractable text', async () => {
    await expect(
      adapter.parse({ buffer: buildPdf([[]]), fileName: 'scan.pdf' }),
    ).rejects.toMatchObject({ code: DomainErrorCodes.PDF_NO_TEXT });
  });

  it('fails with PDF_INVALID for a corrupt file', async () => {
    await expect(
      adapter.parse({
        buffer: Buffer.from('%PDF-1.4 garbage'),
        fileName: 'broken.pdf',
      }),
    ).rejects.toMatchObject({ code: DomainErrorCodes.PDF_INVALID });
  });
});

describe('XlsxIngestionAdapter', () => {
  it('produces one table per sheet with detected headers, captions and cell values', async () => {
    const parsed = await new XlsxIngestionAdapter().parse({
      buffer: await buildSalesWorkbook(),
      fileName: 'ventas.xlsx',
    });
    const tables = parsed.blocks as ParsedTableBlock[];

    expect(parsed.info).toMatchObject({ sheet_count: 2 });
    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({
      sheet: 'Facturación',
      caption: 'Reporte de facturación anual',
      headers: ['Año', 'Región', 'Facturación USD', 'Fecha cierre'],
      headerSource: 'detected',
    });
    expect(tables[0].rows).toEqual([
      { rowNumber: 4, cells: ['2024', 'Norte', '980000', '2024-12-31'] },
      { rowNumber: 5, cells: ['2025', 'Norte', '1250000', '2025-12-31'] },
      // Formula cells expose their computed result.
      { rowNumber: 6, cells: ['2025', 'Sur', '750000', '2025-12-31'] },
    ]);
    expect(tables[1]).toMatchObject({
      sheet: 'Empleados',
      headers: ['Nombre', 'Cargo', 'Ciudad'],
    });
  });

  it('rejects a corrupt workbook', async () => {
    await expect(
      new XlsxIngestionAdapter().parse({
        buffer: Buffer.from('PK\u0003\u0004nope'),
        fileName: 'x.xlsx',
      }),
    ).rejects.toMatchObject({ code: DomainErrorCodes.XLSX_INVALID });
  });

  const workbookWith = async (build: (workbook: ExcelJS.Workbook) => void) => {
    const workbook = new ExcelJS.Workbook();
    build(workbook);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  };

  it('keeps percentage and currency formats instead of bare numbers', async () => {
    const buffer = await workbookWith((workbook) => {
      const sheet = workbook.addWorksheet('Indicadores');
      sheet.addRow(['Indicador', 'Valor', 'Monto']);
      const row = sheet.addRow(['Margen', 0.153, 1250000]);
      row.getCell(2).numFmt = '0.0%';
      row.getCell(3).numFmt = '"$"#,##0.00';
      const euros = sheet.addRow(['Coste', 0.5, -42.5]);
      euros.getCell(2).numFmt = '0%';
      euros.getCell(3).numFmt = '[$EUR-x-euro2] #,##0.00';
    });
    const parsed = await new XlsxIngestionAdapter().parse({
      buffer,
      fileName: 'k.xlsx',
    });
    expect(
      (parsed.blocks[0] as ParsedTableBlock).rows.map((r) => r.cells),
    ).toEqual([
      ['Margen', '15.3%', '$1250000'],
      ['Coste', '50%', '-EUR 42.5'],
    ]);
  });

  it('skips hidden sheets by default and says so', async () => {
    const buffer = await workbookWith((workbook) => {
      workbook.addWorksheet('Visible').addRows([
        ['A', 'B'],
        ['1', '2'],
      ]);
      const secret = workbook.addWorksheet('Salarios', { state: 'hidden' });
      secret.addRows([
        ['Nombre', 'Salario'],
        ['Ana', '9000'],
      ]);
    });
    const parsed = await new XlsxIngestionAdapter().parse({
      buffer,
      fileName: 'h.xlsx',
    });
    expect(parsed.blocks.map((b) => (b as ParsedTableBlock).sheet)).toEqual([
      'Visible',
    ]);
    expect(parsed.warnings.join(' ')).toContain(
      '"Salarios" is hidden and was skipped',
    );

    const opted = await new XlsxIngestionAdapter(
      withLimits({ xlsxIncludeHiddenSheets: true }),
    ).parse({ buffer, fileName: 'h.xlsx' });
    expect(opted.blocks).toHaveLength(2);
  });

  it('fails as a document (not as a process) when the workbook is too large', async () => {
    const buffer = await buildSalesWorkbook();
    await expect(
      new XlsxIngestionAdapter(
        withLimits({ xlsxMaxUncompressedBytes: 1000 }),
      ).parse({
        buffer,
        fileName: 'big.xlsx',
      }),
    ).rejects.toMatchObject({ code: DomainErrorCodes.XLSX_TOO_LARGE });
    await expect(
      new XlsxIngestionAdapter(withLimits({ xlsxMaxCells: 5 })).parse({
        buffer,
        fileName: 'big.xlsx',
      }),
    ).rejects.toMatchObject({ code: DomainErrorCodes.XLSX_TOO_LARGE });
  });
});

describe('TextIngestionAdapter', () => {
  const adapter = new TextIngestionAdapter();

  it('detects markdown headings and keeps paragraphs', async () => {
    const parsed = await adapter.parse({
      buffer: Buffer.from(HANDBOOK_TXT),
      fileName: 'manual.md',
    });
    expect(parsed.title).toBe('Manual de soporte');
    expect(parsed.info).toMatchObject({ encoding: 'utf-8', markdown: true });
    expect(parsed.blocks.filter((block) => block.kind === 'heading')).toEqual([
      { kind: 'heading', text: 'Manual de soporte', level: 1 },
      { kind: 'heading', text: 'Escalamiento', level: 2 },
      { kind: 'heading', text: 'Horario', level: 2 },
    ]);
  });

  it('decodes Windows-1252 and UTF-16 files', () => {
    expect(
      decodeText(Buffer.from('Informaci\xf3n t\xe9cnica', 'latin1')),
    ).toEqual({
      text: 'Información técnica',
      encoding: 'windows-1252',
    });
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('Año', 'utf16le'),
    ]);
    expect(decodeText(utf16)).toEqual({ text: 'Año', encoding: 'utf-16le' });
  });

  it('rejects files without readable content', async () => {
    await expect(
      adapter.parse({ buffer: Buffer.from(' \n\t \n'), fileName: 'empty.txt' }),
    ).rejects.toMatchObject({ code: DomainErrorCodes.TEXT_EMPTY });
  });
});

describe('StructuredIngestionAdapter', () => {
  it('turns arrays of objects into tables and nested objects into field paths', async () => {
    const parsed = await new StructuredIngestionAdapter().parse({
      buffer: Buffer.from(
        JSON.stringify({
          company: { name: 'ACME', address: { city: 'Bogotá' } },
          invoices: [
            { id: 'F-1', total: 100, customer: { name: 'Globex' } },
            { id: 'F-2', total: 250 },
          ],
        }),
      ),
      fileName: 'data.json',
    });

    expect(parsed.blocks).toContainEqual({
      kind: 'text',
      text: 'company.name: ACME\ncompany.address.city: Bogotá',
    });
    const table = parsed.blocks.find(
      (block) => block.kind === 'table',
    ) as ParsedTableBlock;
    expect(table.headers).toEqual(['id', 'total', 'customer.name']);
    expect(table.rows[1].cells).toEqual(['F-2', '250', '']);
  });
});
