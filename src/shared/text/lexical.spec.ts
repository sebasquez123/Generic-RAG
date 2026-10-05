import { indexTokens, queryTerms, toIndexText, toTsQuery } from './lexical';

describe('lexical normalisation', () => {
  it('folds accents and case', () => {
    expect(toIndexText('Facturación Región NORTE')).toBe(
      'facturacion region norte',
    );
  });

  it('indexes identifiers in split and compact form so any spelling matches', () => {
    const tokens = indexTokens('Factura: FV-2025-00123 | NIT 900.123.456');
    for (const token of ['fv', '2025', '00123', 'fv202500123', '900123456'])
      expect(tokens.has(token)).toBe(true);

    expect(queryTerms('fv 2025 00123').identifiers).toEqual(['2025', '00123']);
    expect(queryTerms('factura FV-2025-00123')).toEqual({
      terms: ['factura', 'fv202500123', 'fv', '2025', '00123'],
      identifiers: ['fv202500123'],
    });
    expect(queryTerms('NIT 900123456').identifiers).toEqual(['900123456']);
    expect(indexTokens('NIT 900.123.456').has('900123456')).toBe(true);
  });

  it('drops stop words and single letters from queries', () => {
    expect(queryTerms('¿Cuál es la facturación de 2025 en el Norte?')).toEqual({
      terms: ['facturacion', '2025', 'norte'],
      identifiers: ['2025'],
    });
  });

  it('builds an injection-safe OR tsquery', () => {
    expect(toTsQuery(['a1', 'b2'])).toBe('a1 | b2');
    expect(toTsQuery(["x'); drop table t; --"])).toBeUndefined();
    expect(toTsQuery([])).toBeUndefined();
  });
});
