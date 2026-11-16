import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOConfig, GOCONFIG_PREPARED_SOURCE } from '../GOConfig.js';

describe('GOConfig', () => {
  it('reads values and sources provided at construction', () => {
    const config = new GOConfig(
      { 'a.b': 'x', count: 5, list: ['p', 'q'] },
      new Map([
        ['a.b', 'env'],
        ['count', 'preset'],
      ]),
    );

    assert.strictEqual(config.has('a.b'), true);
    assert.strictEqual(config.has('missing'), false);
    assert.strictEqual(config.get('a.b'), 'x');
    assert.strictEqual(config.getString('a.b'), 'x');
    assert.strictEqual(config.getString('count'), undefined); // present but not a string
    assert.deepStrictEqual(config.getStringArray('list'), ['p', 'q']);
    assert.strictEqual(config.getStringArray('a.b'), undefined); // present but not an array
    assert.strictEqual(config.sourceOf('a.b'), 'env');
    assert.strictEqual(config.sourceOf('count'), 'preset');
  });

  it('set overrides the value and tags the source as prepared by default', () => {
    const config = new GOConfig({ key: 'old' }, new Map([['key', 'preset']]));

    config.set('key', 'new');
    assert.strictEqual(config.getString('key'), 'new');
    assert.strictEqual(config.sourceOf('key'), GOCONFIG_PREPARED_SOURCE);
  });

  it('set accepts a custom source label', () => {
    const config = new GOConfig();
    config.set('key', 'value', 'derived-from-env');
    assert.strictEqual(config.sourceOf('key'), 'derived-from-env');
  });

  it('toRecord returns a plain snapshot including prepared values', () => {
    const config = new GOConfig({ a: 1 });
    config.set('b', 's3://bucket/prefix');
    assert.deepStrictEqual(config.toRecord(), { a: 1, b: 's3://bucket/prefix' });
  });

  it('starts empty when constructed without arguments', () => {
    const config = new GOConfig();
    assert.strictEqual(config.has('anything'), false);
    assert.deepStrictEqual(config.toRecord(), {});
  });
});
