import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalize, tokenDice } from '../text.js';

describe('text', () => {
  it('normalizes to lowercase, strips accents and collapses whitespace', () => {
    assert.strictEqual(normalize('Società   TIMEOUT'), 'societa timeout');
  });

  it('tokenDice is 1 for identical token sets', () => {
    assert.strictEqual(tokenDice('timeout della lambda', 'timeout della lambda'), 1);
  });

  it('tokenDice is 0 for disjoint token sets', () => {
    assert.strictEqual(tokenDice('aaa bbb', 'ccc ddd'), 0);
  });

  it('tokenDice is between 0 and 1 for partial overlap', () => {
    const score = tokenDice('timeout della lambda', 'timeout runtime');
    assert.ok(score > 0 && score < 1);
  });
});
