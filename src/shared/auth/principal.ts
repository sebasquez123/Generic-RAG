import { createHash } from 'node:crypto';

/**
 * What an API key may do. Kept deliberately small:
 * - search: POST /search (and legacy /query/fetch)
 * - read:   list/get documents and inspect their chunks
 * - write:  upload documents and run ingestion
 * - delete: delete documents
 */
export const SCOPES = ['search', 'read', 'write', 'delete'] as const;
export type Scope = (typeof SCOPES)[number];

/** `'*'` grants every namespace (admin/operator keys). */
export type NamespaceAccess = '*' | readonly string[];

export interface ApiKeyConfig {
  name: string;
  /** SHA-256 (hex) of the key. Plain keys are never stored in config. */
  keySha256: string;
  namespaces: NamespaceAccess;
  scopes: readonly Scope[];
}

export interface Principal {
  name: string;
  namespaces: NamespaceAccess;
  scopes: ReadonlySet<Scope>;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

export function canAccessNamespace(
  access: NamespaceAccess,
  namespace: string,
): boolean {
  return access === '*' || access.includes(namespace);
}

export class NamespaceForbiddenError extends Error {
  readonly code = 'NAMESPACE_FORBIDDEN';
}

export class NamespaceRequiredError extends Error {
  readonly code = 'NAMESPACE_REQUIRED';
}

/**
 * The key decides the namespace, never the request body: an explicit namespace
 * must be granted to the key; an omitted one falls back to the key's only
 * namespace (or the default namespace when the key may use it).
 */
export function resolveNamespace(
  access: NamespaceAccess,
  requested: string | undefined,
  defaultNamespace: string,
): string {
  if (requested !== undefined) {
    if (!canAccessNamespace(access, requested))
      throw new NamespaceForbiddenError(
        `API key is not allowed to access namespace "${requested}"`,
      );
    return requested;
  }
  if (access === '*' || access.includes(defaultNamespace))
    return defaultNamespace;
  if (access.length === 1) return access[0];
  throw new NamespaceRequiredError(
    'namespace is required: this API key has access to several namespaces',
  );
}
