import ExcelJS from 'exceljs';
import { buildPdf } from '../test/support/fixtures';

/**
 * Deterministic evaluation corpus (same bytes on every run). It mixes the
 * shapes GenRag must handle: invoice and employee spreadsheets full of ids,
 * codes, amounts, dates and names; a policy PDF; a support handbook; and a
 * JSON contract register.
 */
export interface CorpusDocument {
  name: string;
  buffer: Buffer;
}

const CLIENTS = [
  ['Inversiones Tequendama', '900123456', 'Bogotá'],
  ['Distribuidora El Dorado', '800765432', 'Medellín'],
  ['Agroindustrias del Valle', '890321654', 'Cali'],
  ['Logística Caribe', '901234987', 'Barranquilla'],
  ['Textiles Santander', '860555111', 'Bucaramanga'],
  ['Clínica San Rafael', '811222333', 'Medellín'],
  ['Constructora Andina', '830444777', 'Bogotá'],
  ['Café Montaña Alta', '891999222', 'Manizales'],
] as const;

const STATUSES = ['Pagada', 'Pendiente', 'Vencida'];

const PEOPLE = [
  'Mariana Restrepo',
  'Andrés Cifuentes',
  'Valentina Ospina',
  'Julián Castaño',
  'Camila Bermúdez',
  'Santiago Lozano',
  'Daniela Quintero',
  'Felipe Arango',
  'Laura Montoya',
  'Nicolás Salazar',
  'Isabela Duque',
  'Tomás Villegas',
  'Sara Echeverri',
  'Mateo Giraldo',
  'Paula Cárdenas',
  'Sebastián Henao',
  'Natalia Rendón',
  'Alejandro Marín',
  'Gabriela Uribe',
  'Diego Zuluaga',
];
const ROLES = [
  'Analista contable',
  'Ingeniera de soporte',
  'Gerente comercial',
  'Desarrollador backend',
  'Coordinadora de compras',
];
const AREAS = ['Finanzas', 'ITS', 'Comercial', 'Tecnología', 'Compras'];

const day = (offset: number) =>
  new Date(Date.UTC(2025, 0, 1) + offset * 24 * 3600 * 1000);

async function invoices(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Facturas');
  sheet.addRow(['Registro de facturación 2025']);
  sheet.addRow([]);
  sheet.addRow([
    'Factura',
    'Fecha',
    'Cliente',
    'NIT',
    'Ciudad',
    'Valor',
    'Estado',
  ]);
  for (let index = 1; index <= 120; index += 1) {
    const [client, nit, city] = CLIENTS[index % CLIENTS.length];
    const row = sheet.addRow([
      `FV-2025-${String(index).padStart(5, '0')}`,
      day(index * 2),
      client,
      nit,
      city,
      1_000_000 + ((index * 7919) % 9000) * 1000,
      STATUSES[index % STATUSES.length],
    ]);
    row.getCell(6).numFmt = '"$"#,##0';
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function employees(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Empleados');
  sheet.addRow([
    'Nombre',
    'Cédula',
    'Cargo',
    'Área',
    'Ciudad',
    'Fecha ingreso',
  ]);
  PEOPLE.forEach((name, index) => {
    sheet.addRow([
      name,
      String(1020300000 + index * 3571),
      ROLES[index % ROLES.length],
      AREAS[index % AREAS.length],
      CLIENTS[index % CLIENTS.length][2],
      new Date(Date.UTC(2015 + (index % 9), index % 12, 1 + (index % 27))),
    ]);
  });
  // Hidden scratch sheet: must not be ingested.
  const hidden = workbook.addWorksheet('Salarios', { state: 'hidden' });
  hidden.addRows([
    ['Nombre', 'Salario'],
    ['Mariana Restrepo', 9_800_000],
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const POLICY_PAGES: string[][] = [
  [
    'METGROUP - Manual de políticas internas',
    '1. VACACIONES',
    'Cada colaborador dispone de quince días hábiles de vacaciones remuneradas por año.',
    'Las solicitudes se registran en el portal con treinta días de anticipación y',
    'requieren aprobación del jefe inmediato.',
    '',
    '2. VIÁTICOS',
    'Los viajes nacionales reconocen un viático de 180.000 pesos por noche.',
    'Para viajes internacionales el viático diario es de 120 dólares y debe',
    'legalizarse dentro de los cinco días hábiles siguientes al regreso.',
    'Página 1 de 3',
  ],
  [
    'METGROUP - Manual de políticas internas',
    '3. COMPRAS',
    'Toda compra superior a 50 millones de pesos requiere la aprobación del comité',
    'de compras y al menos tres cotizaciones de proveedores registrados.',
    '',
    '4. SEGURIDAD DE LA INFORMACIÓN',
    'Los portátiles corporativos usan cifrado de disco completo y autenticación',
    'multifactor. Las contraseñas se cambian cada noventa días.',
    'Página 2 de 3',
  ],
  [
    'METGROUP - Manual de políticas internas',
    '5. REPORTE DE INCIDENTES',
    'Un correo sospechoso de suplantación (phishing) se reporta de inmediato a la',
    'mesa de seguridad sin abrir enlaces ni adjuntos.',
    '',
    '6. TELETRABAJO',
    'El teletrabajo se autoriza hasta tres días por semana con acuerdo firmado.',
    'Página 3 de 3',
  ],
];

const HANDBOOK = [
  '# Manual de soporte ITS',
  '',
  '## Escalamiento',
  '',
  'Los incidentes críticos se escalan al ingeniero de guardia en menos de quince minutos.',
  'Si no hay solución en una hora, el ingeniero de guardia notifica al líder técnico.',
  '',
  '## Horario',
  '',
  'La mesa de ayuda atiende de lunes a viernes entre las 7:00 y las 19:00.',
  '',
  '## Códigos de error',
  '',
  'ERR-4031: el token de sesión venció; el usuario debe cerrar sesión e ingresar de nuevo.',
  'ERR-5002: el servicio de facturación electrónica no responde; reintentar en cinco minutos.',
  'ERR-7710: la impresora fiscal perdió conexión con el punto de venta.',
  '',
  '## Copias de seguridad',
  '',
  'Los servidores de producción tienen copias de seguridad diarias cifradas y replicación en dos centros de datos.',
].join('\n');

const PROVIDERS = [
  'Soluciones Nube SAS',
  'Redes del Norte',
  'Papelería Central',
  'Vigilancia Total',
  'Aseo Integral',
];

function contracts(): Buffer {
  const items = Array.from({ length: 25 }, (_, index) => ({
    codigo: `CT-2024-${101 + index}`,
    proveedor: PROVIDERS[index % PROVIDERS.length],
    objeto: [
      'Licencias de software',
      'Enlace de internet dedicado',
      'Suministro de papelería',
      'Vigilancia de sede',
      'Aseo de oficinas',
    ][index % 5],
    monto: 20_000_000 + index * 1_250_000,
    inicio: `2024-${String((index % 12) + 1).padStart(2, '0')}-01`,
    fin: `2025-${String((index % 12) + 1).padStart(2, '0')}-01`,
  }));
  return Buffer.from(JSON.stringify(items, null, 2), 'utf8');
}

export async function buildCorpus(): Promise<CorpusDocument[]> {
  return [
    { name: 'facturas-2025.xlsx', buffer: await invoices() },
    { name: 'empleados.xlsx', buffer: await employees() },
    {
      name: 'politicas-internas.pdf',
      buffer: buildPdf(POLICY_PAGES, { title: 'Manual de políticas internas' }),
    },
    { name: 'manual-soporte.md', buffer: Buffer.from(HANDBOOK, 'utf8') },
    { name: 'contratos.json', buffer: contracts() },
  ];
}
