import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalize, tokenDice } from '../text.js';

describe('text', () => {
  it('normalizes to lowercase, strips accents and collapses whitespace', () => {
    assert.strictEqual(normalize('Società   TIMEOUT'), 'societa timeout');
  });

  it('tokenDice is 1 for identical token sets, 0 for disjoint ones and in between on partial overlap', () => {
    assert.strictEqual(tokenDice('timeout della lambda', 'timeout della lambda'), 1);
    assert.strictEqual(tokenDice('aaa bbb', 'ccc ddd'), 0);
    const partial = tokenDice('timeout della lambda', 'timeout runtime');
    assert.ok(partial > 0 && partial < 1, String(partial));
  });
});
