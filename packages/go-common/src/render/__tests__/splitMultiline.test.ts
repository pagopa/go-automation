import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { splitMultiline } from '../tableRenderer/splitMultiline.js';

describe('splitMultiline', () => {
  it('returns one padded, aligned entry per line (empty lines included)', () => {
    const cases: ReadonlyArray<
      readonly [text: string, width: number, align: 'left' | 'right' | 'center', expected: ReadonlyArray<string>]
    > = [
      ['foo', 5, 'left', ['foo  ']],
      ['a\nbb\nccc', 5, 'left', ['a    ', 'bb   ', 'ccc  ']],
      ['a\n\nb', 3, 'left', ['a  ', '   ', 'b  ']],
      ['', 4, 'left', ['    ']],
      ['a\nbb', 4, 'right', ['   a', '  bb']],
      ['a\nbbb', 5, 'center', ['  a  ', ' bbb ']],
    ];
    for (const [text, width, align, expected] of cases) {
      assert.deepStrictEqual([...splitMultiline(text, width, align)], expected, JSON.stringify(text));
    }
  });
});
