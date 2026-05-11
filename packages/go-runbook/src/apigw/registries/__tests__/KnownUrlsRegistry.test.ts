import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { KnownUrlsRegistry } from '../KnownUrlsRegistry.js';
import type { KnownUrl } from '../../types/KnownUrl.js';

describe('KnownUrlsRegistry', () => {
  describe('match', () => {
    it('matches by prefix (default)', () => {
      const registry = new KnownUrlsRegistry([
        {
          kind: 'external',
          url: 'https://api.io.pagopa.it/api/v1/activations/',
          downstream: 'AppIO',
        },
      ]);

      const result = registry.match('https://api.io.pagopa.it/api/v1/activations/user-123');

      assert.notStrictEqual(result, undefined);
      assert.strictEqual(result?.known.kind, 'external');
      assert.strictEqual(result?.url, 'https://api.io.pagopa.it/api/v1/activations/user-123');
    });

    it('matches by exact', () => {
      const registry = new KnownUrlsRegistry([
        {
          kind: 'internal',
          url: 'http://service/path',
          matchType: 'exact',
          service: 'pn-service',
        },
      ]);

      assert.notStrictEqual(registry.match('http://service/path'), undefined);
      assert.strictEqual(registry.match('http://service/path/extra'), undefined);
    });

    it('matches by regex', () => {
      const registry = new KnownUrlsRegistry([
        {
          kind: 'internal',
          url: '^http://internal-Ecs[A-Z]+-\\d+',
          matchType: 'regex',
          service: 'pn-external-registries',
        },
      ]);

      assert.notStrictEqual(registry.match('http://internal-EcsA-123/path'), undefined);
      assert.strictEqual(registry.match('https://internal-EcsA-123/path'), undefined);
    });

    it('returns undefined when nothing matches', () => {
      const registry = new KnownUrlsRegistry([{ kind: 'external', url: 'https://x.com/', downstream: 'X' }]);
      assert.strictEqual(registry.match('https://y.com/'), undefined);
    });

    it('respects declaration order on overlapping prefixes', () => {
      const registry = new KnownUrlsRegistry([
        { kind: 'external', url: 'https://api.io.pagopa.it/api/', downstream: 'AppIO-broad' },
        { kind: 'external', url: 'https://api.io.pagopa.it/api/v1/', downstream: 'AppIO-v1' },
      ]);

      const result = registry.match('https://api.io.pagopa.it/api/v1/activations');
      assert.strictEqual(result?.known.kind, 'external');
      assert.strictEqual(result?.known.kind === 'external' ? result.known.downstream : '', 'AppIO-broad');
    });
  });

  describe('validation', () => {
    it('rejects internal entry without service', () => {
      const bad: KnownUrl = {
        kind: 'internal',
        url: 'http://x/',
      } as unknown as KnownUrl;
      assert.throws(() => new KnownUrlsRegistry([bad]), /missing 'service'/);
    });

    it('rejects external entry without downstream', () => {
      const bad: KnownUrl = {
        kind: 'external',
        url: 'http://x/',
      } as unknown as KnownUrl;
      assert.throws(() => new KnownUrlsRegistry([bad]), /missing 'downstream'/);
    });

    it('rejects empty url', () => {
      const bad: KnownUrl = {
        kind: 'external',
        url: '   ',
        downstream: 'X',
      };
      assert.throws(() => new KnownUrlsRegistry([bad]), /non-empty string/);
    });

    it('rejects empty service on internal', () => {
      const bad: KnownUrl = {
        kind: 'internal',
        url: 'http://x/',
        service: '   ',
      };
      assert.throws(() => new KnownUrlsRegistry([bad]), /missing 'service'/);
    });
  });

  describe('getInternalServices', () => {
    it('returns the set of internal service names', () => {
      const registry = new KnownUrlsRegistry([
        { kind: 'internal', url: 'http://a/', service: 'pn-a' },
        { kind: 'internal', url: 'http://b/', service: 'pn-b' },
        { kind: 'external', url: 'https://x/', downstream: 'X' },
      ]);
      const services = registry.getInternalServices();
      assert.strictEqual(services.size, 2);
      assert.ok(services.has('pn-a'));
      assert.ok(services.has('pn-b'));
    });

    it('returns empty set when no internal entries', () => {
      const registry = new KnownUrlsRegistry([{ kind: 'external', url: 'https://x/', downstream: 'X' }]);
      assert.strictEqual(registry.getInternalServices().size, 0);
    });
  });

  describe('list', () => {
    it('returns entries in declaration order', () => {
      const entries: ReadonlyArray<KnownUrl> = [
        { kind: 'external', url: 'https://a/', downstream: 'A' },
        { kind: 'external', url: 'https://b/', downstream: 'B' },
      ];
      const registry = new KnownUrlsRegistry(entries);
      const list = registry.list();
      assert.strictEqual(list.length, 2);
      assert.strictEqual(list[0]?.url, 'https://a/');
      assert.strictEqual(list[1]?.url, 'https://b/');
    });
  });
});
