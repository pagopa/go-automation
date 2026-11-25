import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigProviderBase } from '../GOConfigProvider.js';

/** Minimal concrete provider: every key containing "secret" is treated as secret. */
class FixedConfigProvider extends GOConfigProviderBase {
  protected readonly values: Map<string, string | string[]>;

  constructor(entries: ReadonlyArray<readonly [string, string | string[]]>) {
    super();
    this.values = new Map(entries);
  }

  getName(): string {
    return 'Fixed';
  }

  isSecret(key: string): boolean {
    return key.includes('secret');
  }
}

describe('GOConfigProviderBase', () => {
  const provider = new FixedConfigProvider([
    ['service.url', 'https://example.test'],
    ['service.tags', ['alpha', 'beta']],
    ['api.secret', 'token-123'],
    ['api.secretList', ['a', 'b', 'c']],
  ]);

  it('reads values, keys and presence from the backing map', () => {
    assert.strictEqual(provider.getValue('service.url'), 'https://example.test');
    assert.deepStrictEqual(provider.getValue('service.tags'), ['alpha', 'beta']);
    assert.strictEqual(provider.getValue('missing'), undefined);
    assert.strictEqual(provider.hasKey('service.url'), true);
    assert.strictEqual(provider.hasKey('missing'), false);
    assert.deepStrictEqual(provider.getAllKeys(), ['service.url', 'service.tags', 'api.secret', 'api.secretList']);
  });

  it('redacts secret values for display, keeping their length', () => {
    assert.strictEqual(provider.getDisplayValue('service.url'), 'https://example.test');
    assert.strictEqual(provider.getDisplayValue('api.secret'), '[REDACTED (9 chars)]');
    assert.strictEqual(provider.getDisplayValue('api.secretList'), '[REDACTED (3 items)]');
    assert.strictEqual(provider.getDisplayValue('missing'), undefined);
  });

  it('renders a redacted debug representation', () => {
    assert.strictEqual(
      provider.toString(),
      [
        'Fixed (4 keys)',
        '  service.url: https://example.test',
        '  service.tags: [alpha, beta]',
        '  api.secret: [REDACTED (9 chars)]',
        '  api.secretList: [REDACTED (3 items)]',
      ].join('\n'),
    );
  });
});
