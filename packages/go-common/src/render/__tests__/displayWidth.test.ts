import { describe, it } from 'node:test';
import assert from 'node:assert';

import { displayWidth } from '../tableRenderer/displayWidth.js';

describe('displayWidth', () => {
  it('returns 0 for empty string', () => {
    assert.strictEqual(displayWidth(''), 0);
  });

  it('returns the same length for plain ASCII', () => {
    assert.strictEqual(displayWidth('hello'), 5);
  });

  it('ignores ANSI escape sequences', () => {
    assert.strictEqual(displayWidth('\x1b[31mfoo\x1b[0m'), 3);
  });

  it('counts CJK characters as 2 cells', () => {
    assert.strictEqual(displayWidth('日本'), 4);
  });

  it('counts simple emoji as 2 cells', () => {
    assert.strictEqual(displayWidth('🎉'), 2);
  });
});
