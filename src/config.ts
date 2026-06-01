import { readFileSync } from 'node:fs';
import path from 'node:path';

import { config, parse } from 'dotenv';
import type { Level } from 'pino';

config({ path: path.join(__dirname, '..', '.env') });

const exampleEnv = parse(readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8'));

const missedEnvironmentVariables = Object.keys(exampleEnv).filter((exampleKey) => !process.env[exampleKey]);
if (missedEnvironmentVariables.length > 0)
  throw new Error(`${missedEnvironmentVariables.join(', ')} not configured`);

export default {
  app: {
    name: 'gen-rag',
    env: process.env['APP_ENV']!,
    port: Number.parseInt(process.env['APP_PORT']!),
    apiUrl: process.env['APP_API_URL']!,
    version: process.env['APP_VERSION']!,
    isDev: process.env['APP_ENV'] === 'dev' ? true : false,
  },
  log: {
    level: process.env['LOG_LEVEL']! as Level,
  },
  llm: {
    gpt: {
      apiKey: process.env['OPENAI_API_KEY']!,
    },
    gemini: {
      apiKey: process.env['GEMINI_API_KEY']!,
    },
  },
  agent: {
    artifact: process.env['ARTIFACT']!,
  }
} as const;
