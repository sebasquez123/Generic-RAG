import { extname } from 'node:path';
import { DocumentType } from '~/shared/types/semantic-pipeline.type';
import {
  InvalidDocumentError,
  UnsupportedDocumentTypeError,
} from '../errors/domain_errors';

const EXTENSIONS: Record<string, DocumentType> = {
  '.pdf': DocumentType.Pdf,
  '.xlsx': DocumentType.Xlsx,
  '.txt': DocumentType.Txt,
  '.text': DocumentType.Txt,
  '.md': DocumentType.Txt,
  '.markdown': DocumentType.Txt,
  '.log': DocumentType.Txt,
  '.json': DocumentType.Json,
};

const MIME_TYPES: Record<string, DocumentType> = {
  'application/pdf': DocumentType.Pdf,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    DocumentType.Xlsx,
  'text/plain': DocumentType.Txt,
  'text/markdown': DocumentType.Txt,
  'application/json': DocumentType.Json,
};

const UNSUPPORTED_HINTS: Record<string, string> = {
  '.xls': 'Legacy .xls workbooks are not supported; save the file as .xlsx.',
  '.csv':
    'CSV is not supported yet; save the file as .xlsx to keep its table structure.',
  '.doc': 'Word documents are not supported; export the file to PDF.',
  '.docx': 'Word documents are not supported; export the file to PDF.',
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSIONS);

export function detectDocumentType(
  fileName: string,
  mimeType?: string,
  declared?: DocumentType,
): DocumentType {
  if (declared) return declared;

  const extension = extname(fileName).toLowerCase();
  if (EXTENSIONS[extension]) return EXTENSIONS[extension];
  if (UNSUPPORTED_HINTS[extension])
    throw new UnsupportedDocumentTypeError(UNSUPPORTED_HINTS[extension]);

  const byMime = mimeType
    ? MIME_TYPES[mimeType.split(';')[0].trim()]
    : undefined;
  if (byMime) return byMime;

  throw new UnsupportedDocumentTypeError(
    `Unsupported file "${fileName}". Supported extensions: ${SUPPORTED_EXTENSIONS.join(', ')}`,
  );
}

/** Magic-byte check so a renamed binary never reaches a parser. */
export function assertContentMatchesType(buffer: Buffer, type: DocumentType) {
  if (buffer.length === 0)
    throw new InvalidDocumentError('The uploaded file is empty');

  switch (type) {
    case DocumentType.Pdf:
      if (!buffer.subarray(0, 1024).includes('%PDF-'))
        throw new InvalidDocumentError(
          'File is not a valid PDF (missing %PDF header)',
        );
      return;
    case DocumentType.Xlsx:
      if (buffer.readUInt32LE(0) !== 0x04034b50)
        throw new InvalidDocumentError(
          'File is not a valid XLSX workbook (not a zip container)',
        );
      return;
    case DocumentType.Txt:
    case DocumentType.Json: {
      const head = buffer.subarray(0, 8192);
      const utf16 =
        (head[0] === 0xff && head[1] === 0xfe) ||
        (head[0] === 0xfe && head[1] === 0xff);
      if (!utf16 && head.includes(0))
        throw new InvalidDocumentError('File looks binary, not text');
      return;
    }
  }
}
