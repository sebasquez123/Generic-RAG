import type { Config } from 'jest';

// Unit specs only (*.spec.ts). E2E (*.e2e-spec.ts) and pgvector integration
// (*.int-spec.ts) suites have their own npm scripts.
const config: Config = {
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  testRegex: String.raw`\.spec\.ts$`,
  transform: { [String.raw`^.+\.ts$`]: ['ts-jest', { diagnostics: false }] },
  moduleNameMapper: { '^~/(.*)$': '<rootDir>/src/$1' },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};

export default config;
