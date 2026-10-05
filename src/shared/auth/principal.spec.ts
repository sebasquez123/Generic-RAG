import { loadApiKeys } from './api-key-config';
import { hashApiKey, resolveNamespace } from './principal';

describe('API keys', () => {
  const entry = {
    name: 'finance-bot',
    key_sha256: hashApiKey('secret'),
    namespaces: ['finance'],
    scopes: ['search'],
  };

  it('loads hashed keys from RAG_API_KEYS', () => {
    expect(loadApiKeys({ RAG_API_KEYS: JSON.stringify([entry]) })).toEqual([
      {
        name: 'finance-bot',
        keySha256: hashApiKey('secret'),
        namespaces: ['finance'],
        scopes: ['search'],
      },
    ]);
    expect(loadApiKeys({})).toEqual([]);
    // A single entry without the surrounding array is accepted too.
    expect(loadApiKeys({ RAG_API_KEYS: JSON.stringify(entry) })).toHaveLength(
      1,
    );
  });

  it('rejects malformed configuration instead of starting half-secured', () => {
    expect(() => loadApiKeys({ RAG_API_KEYS: 'nope' })).toThrow('JSON array');
    expect(() =>
      loadApiKeys({
        RAG_API_KEYS: JSON.stringify([{ ...entry, key_sha256: 'plain-key' }]),
      }),
    ).toThrow('hex SHA-256');
    expect(() =>
      loadApiKeys({
        RAG_API_KEYS: JSON.stringify([{ ...entry, scopes: ['admin'] }]),
      }),
    ).toThrow('Invalid RAG_API_KEYS');
    expect(() =>
      loadApiKeys({ RAG_API_KEYS: JSON.stringify([entry, entry]) }),
    ).toThrow('Duplicate');
  });
});

describe('resolveNamespace', () => {
  it('lets the key, not the request, decide the namespace', () => {
    expect(resolveNamespace(['a'], 'a', 'default')).toBe('a');
    expect(() => resolveNamespace(['a'], 'b', 'default')).toThrow(
      'not allowed',
    );
    expect(resolveNamespace(['a'], undefined, 'default')).toBe('a');
    expect(resolveNamespace(['a', 'default'], undefined, 'default')).toBe(
      'default',
    );
    expect(() => resolveNamespace(['a', 'b'], undefined, 'default')).toThrow(
      'required',
    );
    expect(resolveNamespace('*', 'anything', 'default')).toBe('anything');
    expect(resolveNamespace('*', undefined, 'default')).toBe('default');
  });
});
