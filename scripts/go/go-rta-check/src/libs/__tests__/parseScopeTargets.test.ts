import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseScopeTargets, scopedEnvironmentIds } from '../parseScopeTargets.js';

describe('parseScopeTargets', () => {
  it('returns an empty scope when nothing is configured', () => {
    assert.deepStrictEqual(parseScopeTargets({}), []);
    assert.deepStrictEqual(parseScopeTargets({ targets: ['  ', ''] }), []);
  });

  it('parses the JSON entries produced by config.json', () => {
    const scope = parseScopeTargets({
      targets: ['{"productId":"p1","environmentIds":["e1","e2"]}', '{"productId":"p2","environmentIds":["e3"]}'],
    });

    assert.deepStrictEqual(scope, [
      { productId: 'p1', environmentIds: ['e1', 'e2'] },
      { productId: 'p2', environmentIds: ['e3'] },
    ]);
  });

  it('parses the CLI-safe compact form', () => {
    const scope = parseScopeTargets({ targets: ['p1:e1|e2', 'p2'] });

    assert.deepStrictEqual(scope, [
      { productId: 'p1', environmentIds: ['e1', 'e2'] },
      { productId: 'p2', environmentIds: [] },
    ]);
  });

  it('merges repeated products and never narrows an unrestricted one', () => {
    const scope = parseScopeTargets({ targets: ['p1:e1', 'p1:e2', 'p2', 'p2:e9'] });

    assert.deepStrictEqual(scope, [
      { productId: 'p1', environmentIds: ['e1', 'e2'] },
      { productId: 'p2', environmentIds: [] },
    ]);
  });

  it('deduplicates environments and keeps declaration order', () => {
    const scope = parseScopeTargets({ targets: ['{"productId":"p1","environmentIds":["e2","e1","e2"]}'] });

    assert.deepStrictEqual(scope, [{ productId: 'p1', environmentIds: ['e2', 'e1'] }]);
  });

  it('rejects an entry without a product id', () => {
    assert.throws(() => parseScopeTargets({ targets: ['{"environmentIds":["e1"]}'] }), /productId is required/u);
  });

  it('rejects malformed JSON entries', () => {
    assert.throws(() => parseScopeTargets({ targets: ['{"productId":'] }), /Invalid JSON targets\[0\]/u);
    assert.throws(() => parseScopeTargets({ targets: ['{"productId":"p1","environmentIds":[3]}'] }), /non-empty/u);
  });
});

describe('scopedEnvironmentIds', () => {
  const scope = [
    { productId: 'p1', environmentIds: ['e1', 'e2'] },
    { productId: 'p2', environmentIds: [] },
  ];

  it('returns the allowed environments of a restricted product', () => {
    assert.deepStrictEqual(scopedEnvironmentIds(scope, 'p1'), ['e1', 'e2']);
  });

  it('returns undefined when the product is unrestricted or absent', () => {
    assert.strictEqual(scopedEnvironmentIds(scope, 'p2'), undefined);
    assert.strictEqual(scopedEnvironmentIds(scope, 'p3'), undefined);
    assert.strictEqual(scopedEnvironmentIds([], 'p1'), undefined);
  });
});
