import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';

// Deterministic, offline test environment. No real credentials are used:
// every key required by `.env.example` gets a placeholder unless already set.
process.env.LOG_LEVEL ??= 'silent';
process.env.APP_ENV ??= 'test';
process.env.APP_PORT ??= '0';
process.env.APP_VERSION ??= 'test';
process.env.RAG_EMBEDDING_PROVIDER ??= 'hashing';

const example = join(__dirname, '..', '.env.example');
if (existsSync(example)) {
  for (const key of Object.keys(parse(readFileSync(example, 'utf8'))))
    process.env[key] ??= 'test-placeholder';
}
