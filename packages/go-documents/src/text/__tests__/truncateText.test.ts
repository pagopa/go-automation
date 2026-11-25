import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { truncateText } from '../extractors/truncateText.js';

describe('truncateText', () => {
  it('truncates at the byte limit without splitting multi-byte characters', () => {
    const cases: ReadonlyArray<readonly [string, string, number, string, boolean]> = [
      ['below the limit', 'hello', 1024, 'hello', false],
      ['ASCII at the byte boundary', 'abcdef', 3, 'abc', true],
      // 'è' is 2 bytes in UTF-8, 🎉 is 4.
      ['a 2-byte character', 'aè', 2, 'a', true],
      ['an emoji', 'a🎉', 3, 'a', true],
      ['a zero limit', 'whatever', 0, '', true],
    ];

    for (const [name, input, maxBytes, text, truncated] of cases) {
      assert.deepStrictEqual(truncateText(input, maxBytes), { text, truncated }, name);
    }
  });
});
