import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Condition } from '../../framework.js';
import { all, any, not } from '../conditions.js';

const LEFT: Condition = { type: 'exists', ref: 'vars.left' };
const RIGHT: Condition = { type: 'exists', ref: 'vars.right' };

describe('condition helpers', () => {
  it('builds logical AND and OR conditions', () => {
    assert.deepStrictEqual(all(LEFT, RIGHT), { type: 'and', conditions: [LEFT, RIGHT] });
    assert.deepStrictEqual(any(LEFT, RIGHT), { type: 'or', conditions: [LEFT, RIGHT] });
  });

  it('builds a logical NOT condition', () => {
    assert.deepStrictEqual(not(LEFT), { type: 'not', condition: LEFT });
  });
});
