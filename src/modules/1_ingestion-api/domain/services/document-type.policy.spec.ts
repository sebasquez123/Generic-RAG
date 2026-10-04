import { DocumentType } from '~/shared/types/semantic-pipeline.type';
import {
  assertContentMatchesType,
  detectDocumentType,
} from './document-type.policy';
import { detectHeading } from './text-normalization';

describe('document type policy', () => {
  it('detects supported types by extension, then mime type', () => {
    expect(detectDocumentType('Informe.PDF')).toBe(DocumentType.Pdf);
    expect(detectDocumentType('ventas.xlsx')).toBe(DocumentType.Xlsx);
    expect(detectDocumentType('notas.md')).toBe(DocumentType.Txt);
    expect(detectDocumentType('blob', 'application/json')).toBe(
      DocumentType.Json,
    );
  });

  it('explains unsupported formats', () => {
    expect(() => detectDocumentType('viejo.xls')).toThrow('.xlsx');
    expect(() => detectDocumentType('imagen.png', 'image/png')).toThrow(
      'Unsupported file',
    );
  });

  it('rejects content that does not match the declared type', () => {
    expect(() =>
      assertContentMatchesType(Buffer.from('hola'), DocumentType.Pdf),
    ).toThrow('valid PDF');
    expect(() =>
      assertContentMatchesType(Buffer.from('%PDF-1.7'), DocumentType.Xlsx),
    ).toThrow('zip');
    expect(() =>
      assertContentMatchesType(
        Buffer.from([0x61, 0x00, 0x62]),
        DocumentType.Txt,
      ),
    ).toThrow('binary');
    expect(() =>
      assertContentMatchesType(Buffer.alloc(0), DocumentType.Txt),
    ).toThrow('empty');
    expect(() =>
      assertContentMatchesType(Buffer.from('%PDF-1.7 ...'), DocumentType.Pdf),
    ).not.toThrow();
  });
});

describe('heading detection', () => {
  it.each([
    ['2.3 Alcance del servicio', 2],
    ['3. Seguridad', 1],
    ['POLÍTICA DE VACACIONES', 1],
  ])('treats "%s" as a heading of level %i', (line, level) => {
    expect(detectHeading(line, { markdown: false })?.level).toBe(level);
  });

  it.each([
    'Los ingresos crecieron un 12% durante el año.',
    '1. comprar insumos para la oficina central de la compañía',
    'IVA',
  ])('does not treat "%s" as a heading', (line) => {
    expect(detectHeading(line, { markdown: false })).toBeUndefined();
  });
});
