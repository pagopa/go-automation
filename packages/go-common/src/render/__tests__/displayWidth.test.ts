import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { displayWidth } from '../tableRenderer/displayWidth.js';

describe('displayWidth', () => {
  it('counts terminal cells: ANSI ignored, CJK and emoji 2 cells', () => {
    const cases: ReadonlyArray<readonly [text: string, width: number]> = [
      ['', 0],
      ['hello', 5],
      ['\x1b[31mfoo\x1b[0m', 3],
      ['日本', 4],
      ['🎉', 2],
    ];
    for (const [text, width] of cases) {
      assert.strictEqual(displayWidth(text), width, JSON.stringify(text));
    }
  });
});
