import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOConfigObjectFlattener } from '../GOConfigObjectFlattener.js';

function createNestedObject(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let cursor = root;

  for (let index = 0; index < depth; index++) {
    const next: Record<string, unknown> = {};
    cursor[`level${String(index)}`] = next;
    cursor = next;
  }

  cursor['value'] = 'ok';
  return root;
}

describe('GOConfigObjectFlattener', () => {
  it('flattens nested objects and converts primitive values to strings', () => {
    const flattened = GOConfigObjectFlattener.flatten({
      athena: {
        database: 'pn_analytics',
        max: {
          attempts: 60,
        },
      },
      flags: ['a', 2, true],
      enabled: true,
      empty: null,
    });

    assert.strictEqual(flattened.get('athena.database'), 'pn_analytics');
    assert.strictEqual(flattened.get('athena.max.attempts'), '60');
    assert.deepStrictEqual(flattened.get('flags'), ['a', '2', 'true']);
    assert.strictEqual(flattened.get('enabled'), 'true');
    assert.strictEqual(flattened.has('empty'), false);
  });

  it('rejects dangerous keys at nested levels', () => {
    assert.throws(
      () =>
        GOConfigObjectFlattener.flatten({
          safe: {
            constructor: 'bad',
          },
        }),
      /Unsafe configuration key "safe\.constructor" is not allowed/,
    );
  });

  it('rejects dangerous keys inside array objects', () => {
    assert.throws(
      () =>
        GOConfigObjectFlattener.flatten({
          entries: [{ prototype: 'bad' }],
        }),
      /Unsafe configuration key "entries\[0\]\.prototype" is not allowed/,
    );
  });

  it('rejects objects deeper than the configured max depth', () => {
    assert.throws(
      () => GOConfigObjectFlattener.flatten(createNestedObject(3), { maxDepth: 2 }),
      /Configuration object exceeds maximum depth of 2/,
    );
  });
});
