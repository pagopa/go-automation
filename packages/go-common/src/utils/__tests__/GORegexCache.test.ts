import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GORegexCache } from '../GORegexCache.js';
import { compileRegex, isValidRegex } from '../GORegexUtils.js';

describe('isValidRegex', () => {
  it('tells valid from invalid patterns', () => {
    assert.strictEqual(isValidRegex('timeout|ECONNRESET'), true);
    assert.strictEqual(isValidRegex('[unclosed'), false);
  });
});

describe('compileRegex', () => {
  it('compiles a fresh expression on every call', () => {
    const first = compileRegex('a+');
    assert.ok(first.test('aaa'));
    assert.notStrictEqual(compileRegex('a+'), first);
  });

  it('names the invalid pattern and keeps the cause', () => {
    assert.throws(
      () => compileRegex('[unclosed'),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^Invalid regex pattern "\[unclosed": /u);
        assert.ok(error.cause instanceof SyntaxError);
        return true;
      },
    );
  });
});

describe('GORegexCache', () => {
  it('returns the same compiled expression for the same pattern', () => {
    const cache = new GORegexCache();
    assert.strictEqual(cache.compile('x\\d+'), cache.compile('x\\d+'));
    assert.strictEqual(cache.size, 1);
  });

  it('evicts the oldest pattern when full', () => {
    const cache = new GORegexCache(2);
    const first = cache.compile('a');
    cache.compile('b');
    cache.compile('c');
    assert.strictEqual(cache.size, 2);
    assert.notStrictEqual(cache.compile('a'), first);
  });

  it('keeps no state across instances', () => {
    assert.notStrictEqual(new GORegexCache().compile('a'), new GORegexCache().compile('a'));
  });

  it('rejects invalid patterns without caching them', () => {
    const cache = new GORegexCache();
    assert.throws(() => cache.compile('[unclosed'), /Invalid regex pattern/u);
    assert.strictEqual(cache.size, 0);
  });
});
