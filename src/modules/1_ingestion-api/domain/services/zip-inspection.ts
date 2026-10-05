/**
 * Reads a zip's central directory (no decompression) to learn how large the
 * archive becomes once inflated. XLSX files are zips of XML: a 25 MB upload can
 * expand to gigabytes, and exceljs inflates the whole workbook in memory.
 *
 * Declared sizes can be forged; this is a cheap first guard against oversized
 * and zip-bomb workbooks, not a sandbox. Worker crashes are still contained by
 * the lease + max-attempts mechanism.
 */
export interface ZipSummary {
  entries: number;
  uncompressedBytes: number;
  /** ZIP64 archives (>4 GB or >65k entries) are never legitimate workbooks here. */
  zip64: boolean;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;

export function inspectZip(buffer: Buffer): ZipSummary | undefined {
  const searchStart = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_COMMENT);
  let eocd = -1;
  for (
    let offset = buffer.length - EOCD_MIN_SIZE;
    offset >= searchStart;
    offset -= 1
  )
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  if (eocd < 0) return undefined;

  const entries = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries === 0xffff || directoryOffset === 0xffffffff)
    return {
      entries,
      uncompressedBytes: Number.POSITIVE_INFINITY,
      zip64: true,
    };

  let uncompressedBytes = 0;
  let offset = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE
    )
      return undefined;
    const size = buffer.readUInt32LE(offset + 24);
    if (size === 0xffffffff)
      return {
        entries,
        uncompressedBytes: Number.POSITIVE_INFINITY,
        zip64: true,
      };
    uncompressedBytes += size;
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
  return { entries, uncompressedBytes, zip64: false };
}
