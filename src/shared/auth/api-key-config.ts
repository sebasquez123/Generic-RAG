import { readFileSync } from 'node:fs';
import z from 'zod';
import { SCOPES, type ApiKeyConfig } from './principal';

const namespaceList = z
  .array(z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/))
  .min(1);

const apiKeyEntry = z
  .object({
    name: z.string().trim().min(1).max(64),
    key_sha256: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/, 'key_sha256 must be a hex SHA-256'),
    namespaces: z.union([z.literal('*'), namespaceList]),
    scopes: z.array(z.enum(SCOPES)).min(1),
  })
  .strict();

/**
 * API keys come from RAG_API_KEYS (JSON array) or RAG_API_KEYS_FILE (path to
 * the same JSON, e.g. a mounted secret). Entries hold the key's SHA-256 only;
 * generate one with `npm run apikey -- --name ... --namespaces ... --scopes ...`.
 */
export function loadApiKeys(env: NodeJS.ProcessEnv): ApiKeyConfig[] {
  const file = env['RAG_API_KEYS_FILE']?.trim();
  const raw = file ? readFileSync(file, 'utf8') : env['RAG_API_KEYS']?.trim();
  if (!raw) return [];

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('RAG_API_KEYS must be a JSON array of API key entries');
  }
  // A single entry (what `npm run apikey` prints) is accepted without brackets.
  const entries =
    json && typeof json === 'object' && !Array.isArray(json) ? [json] : json;
  const parsed = z.array(apiKeyEntry).safeParse(entries);
  if (!parsed.success)
    throw new Error(
      `Invalid RAG_API_KEYS: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );

  const names = new Set<string>();
  return parsed.data.map((entry) => {
    if (names.has(entry.name))
      throw new Error(`Duplicate API key name in RAG_API_KEYS: ${entry.name}`);
    names.add(entry.name);
    return {
      name: entry.name,
      keySha256: entry.key_sha256.toLowerCase(),
      namespaces: entry.namespaces,
      scopes: entry.scopes,
    };
  });
}
