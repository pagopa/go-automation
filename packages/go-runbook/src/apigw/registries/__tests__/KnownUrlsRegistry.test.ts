import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { KnownUrlsRegistry } from '../KnownUrlsRegistry.js';
import type { KnownUrl } from '../../types/KnownUrl.js';

describe('KnownUrlsRegistry', () => {
  describe('match', () => {
    it('matches by prefix (default)', () => {
      const registry = new KnownUrlsRegistry([
        {
          url: 'https://api.io.pagopa.it/api/v1/activations/',
          target: 'AppIO',
        },
      ]);

      const result = registry.match('https://api.io.pagopa.it/api/v1/activations/user-123');

      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result?.known.target, 'AppIO');
      assert.strictEqual(result?.url, 'https://api.io.pagopa.it/api/v1/activations/user-123');
    });

    it('matches by exact', () => {
      const registry = new KnownUrlsRegistry([
        {
          url: 'http://service/path',
          matchType: 'exact',
          target: 'pn-service',
        },
      ]);

      assert.notStrictEqual(registry.match('http://service/path'), undefined);
      assert.strictEqual(registry.match('http://service/path/extra'), undefined);
    });

    it('matches by regex', () => {
      const registry = new KnownUrlsRegistry([
        {
          url: '^http://internal-Ecs[A-Z]+-\\d+',
          matchType: 'regex',
          target: 'pn-external-registries',
        },
      ]);

      assert.notStrictEqual(registry.match('http://internal-EcsA-123/path'), undefined);
      assert.strictEqual(registry.match('https://internal-EcsA-123/path'), undefined);
    });

    it('returns undefined when nothing matches', () => {
      const registry = new KnownUrlsRegistry([{ url: 'https://x.com/', target: 'X' }]);
      assert.strictEqual(registry.match('https://y.com/'), undefined);
    });

    it('respects declaration order on overlapping prefixes', () => {
      const registry = new KnownUrlsRegistry([
        { url: 'https://api.io.pagopa.it/api/', target: 'AppIO-broad' },
        { url: 'https://api.io.pagopa.it/api/v1/', target: 'AppIO-v1' },
      ]);

      const result = registry.match('https://api.io.pagopa.it/api/v1/activations');
      assert.strictEqual(result?.known.target, 'AppIO-broad');
    });
  });

  describe('validation', () => {
    it('rejects entry without target', () => {
      const bad: KnownUrl = {
        url: 'http://x/',
      } as unknown as KnownUrl;
      assert.throws(() => new KnownUrlsRegistry([bad]), /missing 'target'/);
    });

    it('rejects empty url', () => {
      const bad: KnownUrl = {
        url: '   ',
        target: 'X',
      };
      assert.throws(() => new KnownUrlsRegistry([bad]), /non-empty string/);
    });

    it('rejects empty target', () => {
      const bad: KnownUrl = {
        url: 'http://x/',
        target: '   ',
      };
      assert.throws(() => new KnownUrlsRegistry([bad]), /missing 'target'/);
    });
  });

  describe('list', () => {
    it('returns entries in declaration order', () => {
      const entries: ReadonlyArray<KnownUrl> = [
        { url: 'https://a/', target: 'A' },
        { url: 'https://b/', target: 'B' },
      ];
      const registry = new KnownUrlsRegistry(entries);
      const list = registry.list();
      assert.strictEqual(list.length, 2);
      assert.strictEqual(list[0]?.url, 'https://a/');
      assert.strictEqual(list[1]?.url, 'https://b/');
    });
  });
});
