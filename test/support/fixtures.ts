import ExcelJS from 'exceljs';

/**
 * Builds a real, minimal multi-page PDF (Helvetica, WinAnsi). Each page is a
 * list of visual lines; an empty string leaves a blank line.
 */
export function buildPdf(
  pages: string[][],
  info: { title?: string } = {},
): Buffer {
  const escape = (text: string) =>
    text.replace(/[\\()]/g, (char) => `\\${char}`);
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;

  const catalogId = add('');
  const pagesId = add('');
  const fontId = add(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  );
  const pageIds: number[] = [];

  for (const lines of pages) {
    const operations = lines
      .map((line, index) =>
        line
          ? `BT /F1 11 Tf 72 ${760 - index * 16} Td (${escape(line)}) Tj ET`
          : '',
      )
      .filter(Boolean)
      .join('\n');
    const contentId = add(
      `<< /Length ${Buffer.byteLength(operations, 'latin1')} >>\nstream\n${operations}\nendstream`,
    );
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R ` +
          `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
      ),
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const infoId = info.title
    ? add(`<< /Title (${escape(info.title)}) >>`)
    : undefined;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
      .join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R${infoId ? ` /Info ${infoId} 0 R` : ''} >>\n` +
    `startxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/** Two-sheet workbook with a caption row, header row, formulas and dates. */
export async function buildSalesWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.title = 'Reporte comercial';

  const sales = workbook.addWorksheet('Facturación');
  sales.addRow(['Reporte de facturación anual']);
  sales.addRow([]);
  sales.addRow(['Año', 'Región', 'Facturación USD', 'Fecha cierre']);
  sales.addRow([2024, 'Norte', 980000, new Date(Date.UTC(2024, 11, 31))]);
  sales.addRow([2025, 'Norte', 1250000, new Date(Date.UTC(2025, 11, 31))]);
  sales.addRow([
    2025,
    'Sur',
    { formula: 'C5*0.6', result: 750000 },
    new Date(Date.UTC(2025, 11, 31)),
  ]);

  const staff = workbook.addWorksheet('Empleados');
  staff.addRow(['Nombre', 'Cargo', 'Ciudad']);
  staff.addRow(['Ana Gómez', 'Gerente financiera', 'Bogotá']);
  staff.addRow(['Luis Pérez', 'Analista de datos', 'Medellín']);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const REPORT_PDF_PAGES: string[][] = [
  [
    'ACME S.A. - Informe confidencial',
    '1. RESUMEN EJECUTIVO',
    'La compañía cerró el año con un crecimiento sostenido en todas las regiones.',
    'Los ingresos consolidados alcanzaron cifras récord gracias a la expansión',
    'comercial y a la mejora de márgenes operativos.',
    '',
    '2. POLÍTICA DE VACACIONES',
    'Cada empleado dispone de quince días hábiles de vacaciones remuneradas por año.',
    'Las solicitudes deben registrarse con treinta días de anticipación.',
    'Página 1 de 3',
  ],
  [
    'ACME S.A. - Informe confidencial',
    '3. SEGURIDAD DE LA INFORMACIÓN',
    'Todos los portátiles deben usar cifrado de disco completo y autenticación',
    'multifactor. Las contraseñas se rotan cada noventa días.',
    'Página 2 de 3',
  ],
  [
    'ACME S.A. - Informe confidencial',
    '4. INFRAESTRUCTURA',
    'Los servidores de producción se alojan en dos centros de datos redundantes',
    'con replicación síncrona y copias de seguridad diarias cifradas.',
    'Página 3 de 3',
  ],
];

export const HANDBOOK_TXT = [
  '# Manual de soporte',
  '',
  'Este manual describe el proceso de atención de incidentes del área ITS.',
  '',
  '## Escalamiento',
  '',
  'Los incidentes críticos se escalan al ingeniero de guardia en menos de quince minutos.',
  'El ingeniero de guardia notifica al líder técnico si no hay solución en una hora.',
  '',
  '## Horario',
  '',
  'La mesa de ayuda opera de lunes a viernes entre las 7:00 y las 19:00.',
].join('\n');
