import { randomBytes } from 'node:crypto';

export function generateRandomString(length: number): string {
  const bytes = randomBytes(Math.ceil(length / 2));
  return bytes.toString('hex').slice(0, length);
}
