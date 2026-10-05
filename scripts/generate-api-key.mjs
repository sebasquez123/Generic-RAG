#!/usr/bin/env node
// Generates a GenRag API key and the RAG_API_KEYS entry that authorises it.
// The plain key is printed once; only its SHA-256 goes into configuration.
//
//   npm run apikey -- --name finance-bot --namespaces finance --scopes search
//   npm run apikey -- --name operator --namespaces '*' --scopes search,read,write,delete
import { createHash, randomBytes } from 'node:crypto';

const SCOPES = ['search', 'read', 'write', 'delete'];

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((pairs, token, index, all) => {
      if (token.startsWith('--')) pairs.push([token.slice(2), all[index + 1]]);
      return pairs;
    }, []),
);

const name = args.name;
const namespaces = args.namespaces === '*' ? '*' : args.namespaces?.split(',').map((n) => n.trim()).filter(Boolean);
const scopes = (args.scopes ?? 'search').split(',').map((s) => s.trim()).filter(Boolean);

if (!name || !namespaces?.length || scopes.some((scope) => !SCOPES.includes(scope))) {
  console.error(
    'Usage: npm run apikey -- --name <name> --namespaces <ns1,ns2|*> [--scopes search,read,write,delete]',
  );
  process.exit(1);
}

const key = `grk_${randomBytes(32).toString('base64url')}`;
const entry = {
  name,
  key_sha256: createHash('sha256').update(key, 'utf8').digest('hex'),
  namespaces,
  scopes,
};

console.log('API key (store it in your secret manager; it is not shown again):');
console.log(`  ${key}\n`);
console.log('Add this entry to the RAG_API_KEYS JSON array:');
console.log(`  ${JSON.stringify(entry)}`);
