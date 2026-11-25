import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { KnownUrlsRegistry } from '../KnownUrlsRegistry.js';
import type { KnownUrl } from '../KnownUrl.js';

describe('KnownUrlsRegistry', () => {
  describe('match', () => {
    it('matches by prefix (default), in declaration order on overlapping prefixes', () => {
      const registry = new KnownUrlsRegistry([
        { url: 'https://api.io.pagopa.it/api/', target: 'AppIO-broad' },
        { url: 'https://api.io.pagopa.it/api/v1/', target: 'AppIO-v1' },
      ]);

      const result = registry.match('https://api.io.pagopa.it/api/v1/activations/user-123');

      assert.strictEqual(result?.known.target, 'AppIO-broad');
      assert.strictEqual(result.url, 'https://api.io.pagopa.it/api/v1/activations/user-123');
      assert.strictEqual(registry.match('https://y.com/'), undefined);
    });

    it('matches by exact', () => {
      const registry = new KnownUrlsRegistry([
        { url: 'http://service/path', matchType: 'exact', target: 'pn-service' },
      ]);

      assert.notStrictEqual(registry.match('http://service/path'), undefined);
      assert.strictEqual(registry.match('http://service/path/extra'), undefined);
    });

    it('matches by regex', () => {
      const registry = new KnownUrlsRegistry([
        { url: '^http://internal-Ecs[A-Z]+-\\d+', matchType: 'regex', target: 'pn-external-registries' },
      ]);

      assert.notStrictEqual(registry.match('http://internal-EcsA-123/path'), undefined);
      assert.strictEqual(registry.match('https://internal-EcsA-123/path'), undefined);
    });
  });

  it('rejects an entry with an empty url or a missing or empty target', () => {
    for (const [bad, message] of [
      [{ url: 'http://x/' }, /missing 'target'/],
      [{ url: '   ', target: 'X' }, /non-empty string/],
      [{ url: 'http://x/', target: '   ' }, /missing 'target'/],
    ] as const) {
      // Safe: the entries are malformed on purpose.
      assert.throws(() => new KnownUrlsRegistry([bad as unknown as KnownUrl]), message);
    }
  });

  it('lists the entries in declaration order', () => {
    const entries: ReadonlyArray<KnownUrl> = [
      { url: 'https://a/', target: 'A' },
      { url: 'https://b/', target: 'B' },
    ];
    assert.deepStrictEqual(
      new KnownUrlsRegistry(entries).list().map(({ url }) => url),
      ['https://a/', 'https://b/'],
    );
  });
});
