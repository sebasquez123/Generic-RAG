import type { RagConfig } from '~/config';
import {
  ChunkType,
  ChunkingStrategy,
  DocumentType,
  type ParsedDocument,
} from '~/shared/types/semantic-pipeline.type';
import { explodeText, packUnits, renderUnits } from '../domain/text-units';
import { CHUNKING_VERSION, ChunkingService } from './chunking.service';

const config = {
  chunking: {
    chunkSize: 1200,
    chunkOverlap: 200,
    minChunkChars: 40,
    tableMaxRowsPerChunk: 20,
  },
} as unknown as RagConfig;

const sentence = (index: number) =>
  `Sentence number ${index} explains one specific operational detail of the platform.`;

describe('text units', () => {
  it('never cuts words and keeps sentence-aligned overlap between chunks', () => {
    const paragraph = Array.from({ length: 30 }, (_, index) =>
      sentence(index),
    ).join(' ');
    const chunks = packUnits(explodeText(paragraph, 300, '\n\n'), 300, 100).map(
      renderUnits,
    );

    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300);
      expect(chunk).toMatch(/^Sentence number \d+/);
      expect(chunk).toMatch(/platform\.$/);
    }
    // The last sentence of a chunk is repeated at the start of the next one.
    const lastOfFirst = chunks[0].split(/(?<=\.)\s/).at(-1)!;
    expect(chunks[1].startsWith(lastOfFirst)).toBe(true);
  });

  it('hard-splits a single token longer than the chunk size', () => {
    const units = explodeText('x'.repeat(650), 300, '\n\n');
    expect(units.map((unit) => unit.text.length)).toEqual([300, 300, 50]);
  });
});

describe('ChunkingService', () => {
  const service = new ChunkingService(config);
  const options = service.resolveOptions();

  it('chunks prose by section and tracks page ranges and heading paths', () => {
    const document: ParsedDocument = {
      type: DocumentType.Pdf,
      info: {},
      warnings: [],
      blocks: [
        { kind: 'heading', text: '1. Introducción', level: 1, page: 1 },
        {
          kind: 'text',
          text: 'El sistema centraliza la ingesta de documentos corporativos.',
          page: 1,
        },
        { kind: 'heading', text: '1.1 Alcance', level: 2, page: 1 },
        {
          kind: 'text',
          text: Array.from({ length: 25 }, (_, i) => sentence(i)).join(' '),
          page: 1,
        },
        {
          kind: 'text',
          text: Array.from({ length: 25 }, (_, i) => sentence(i + 25)).join(
            ' ',
          ),
          page: 2,
        },
        { kind: 'heading', text: '2. Riesgos', level: 1, page: 3 },
        {
          kind: 'text',
          text: 'La pérdida de trazabilidad es el principal riesgo identificado.',
          page: 3,
        },
      ],
    };

    const chunks = service.chunk(document, options);

    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
    expect(chunks[0]).toMatchObject({
      section: '1. Introducción',
      pageStart: 1,
      pageEnd: 1,
      metadata: { heading_path: ['1. Introducción'] },
    });
    expect(chunks[0].content.startsWith('1. Introducción\n\nEl sistema')).toBe(
      true,
    );

    const scope = chunks.filter((chunk) => chunk.section === '1.1 Alcance');
    expect(scope.length).toBeGreaterThan(1);
    expect(scope[0].metadata.heading_path).toEqual([
      '1. Introducción',
      '1.1 Alcance',
    ]);
    expect(
      scope.some((chunk) => chunk.pageStart === 1 && chunk.pageEnd === 2),
    ).toBe(true);
    scope.forEach((chunk) =>
      expect(chunk.content.length).toBeLessThanOrEqual(options.chunkSize),
    );

    expect(chunks.at(-1)).toMatchObject({
      section: '2. Riesgos',
      pageStart: 3,
      metadata: { heading_path: ['2. Riesgos'] },
    });
  });

  it('renders tables as row groups with headers and a summary chunk', () => {
    const rows = Array.from({ length: 45 }, (_, index) => ({
      rowNumber: index + 2,
      cells: [String(2000 + index), 'Norte', String(1000 * index)],
    }));
    const chunks = service.chunk(
      {
        type: DocumentType.Xlsx,
        info: {},
        warnings: [],
        blocks: [
          {
            kind: 'table',
            sheet: 'Ventas',
            tableIndex: 0,
            caption: 'Histórico',
            headers: ['Año', 'Región', 'Total'],
            headerSource: 'detected',
            rows,
          },
        ],
      },
      options,
    );

    expect(chunks[0]).toMatchObject({
      chunkType: ChunkType.TableSummary,
      sheet: 'Ventas',
      section: 'Histórico',
      metadata: { row_start: 2, row_end: 46, row_count: 45 },
    });
    expect(chunks[0].content).toContain('Columns: Año, Región, Total');

    const groups = chunks.filter(
      (chunk) => chunk.chunkType === ChunkType.TableRows,
    );
    expect(
      groups.map((chunk) => [chunk.metadata.row_start, chunk.metadata.row_end]),
    ).toEqual([
      [2, 21],
      [22, 41],
      [42, 46],
    ]);
    expect(groups[0].content.split('\n')[0]).toBe(
      'Row 2: Año: 2000 | Región: Norte | Total: 0',
    );
  });

  it('drops empty and duplicated chunks', () => {
    const chunks = service.chunk(
      {
        type: DocumentType.Txt,
        info: {},
        warnings: [],
        blocks: [
          { kind: 'heading', text: 'A', level: 1 },
          { kind: 'text', text: 'Contenido repetido del pie de página.' },
          { kind: 'heading', text: 'B', level: 1 },
          { kind: 'text', text: '---' },
        ],
      },
      options,
    );
    expect(chunks.map((chunk) => chunk.content)).toEqual([
      'A\n\nContenido repetido del pie de página.',
      'B\n\n---',
    ]);
  });

  it('validates overrides and stamps the chunking version', () => {
    expect(
      service.resolveOptions({
        chunkSize: 800,
        strategy: ChunkingStrategy.Recursive,
      }),
    ).toMatchObject({
      chunkSize: 800,
      strategy: ChunkingStrategy.Recursive,
      version: CHUNKING_VERSION,
    });
    expect(() => service.resolveOptions({ chunkSize: 50 })).toThrow(
      'chunk_size',
    );
    expect(() =>
      service.resolveOptions({ chunkSize: 400, chunkOverlap: 300 }),
    ).toThrow('chunk_overlap');
  });

  it('builds the embedding input with structural context but stores clean content', () => {
    const [chunk] = service.chunk(
      {
        type: DocumentType.Txt,
        info: {},
        warnings: [],
        blocks: [
          { kind: 'heading', text: 'Horario', level: 2 },
          { kind: 'text', text: 'La mesa de ayuda opera de lunes a viernes.' },
        ],
      },
      options,
    );
    expect(chunk.content).not.toContain('Document:');
    expect(service.buildEmbeddingInput('manual.md', chunk)).toBe(
      'Document: manual.md\nSection: Horario\n\nHorario\n\nLa mesa de ayuda opera de lunes a viernes.',
    );
  });
});
