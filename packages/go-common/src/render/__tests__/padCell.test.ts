import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { padCell } from '../tableRenderer/padCell.js';

describe('padCell', () => {
  it('pads, aligns and truncates to the display width', () => {
    const colored = '\x1b[31mhi\x1b[0m';
    const cases: ReadonlyArray<
      readonly [text: string, width: number, align: 'left' | 'right' | 'center', expected: string]
    > = [
      ['hello', 0, 'left', ''],
      ['hello', -1, 'left', ''],
      ['abc', 3, 'left', 'abc'],
      ['abc', 3, 'right', 'abc'],
      ['abc', 3, 'center', 'abc'],
      ['hi', 5, 'left', 'hi   '],
      ['hi', 5, 'right', '   hi'],
      // 3 cells to split → floor on the left, ceil on the right.
      ['hi', 5, 'center', ' hi  '],
      ['hello world', 6, 'left', 'hello…'],
      ['hello', 1, 'left', '…'],
      // ANSI codes kept intact, only visible cells count.
      [colored, 5, 'left', `${colored}   `],
      ['日', 5, 'left', '日   '],
      // A second wide char would overflow: a space lands the ellipsis exactly on the width.
      ['日本語', 4, 'left', '日 …'],
    ];
    for (const [text, width, align, expected] of cases) {
      assert.strictEqual(padCell(text, width, align), expected, JSON.stringify([text, width, align]));
    }
  });
});
