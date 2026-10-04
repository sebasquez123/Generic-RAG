/** Busboy decodes multipart filenames as latin1; recover UTF-8 names. */
export function decodeFileName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? name : decoded;
}
