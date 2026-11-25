import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatOutputSuffix } from '../formatOutputSuffix.js';

describe('formatOutputSuffix', () => {
  it('returns an empty string without a meaningful suffix, otherwise prefixes it and replaces reserved characters', () => {
    const cases: ReadonlyArray<readonly [string | undefined, string]> = [
      [undefined, ''],
      ['', ''],
      ['   ', ''],
      ['2026-07-09T09:30:00.000Z', '-2026-07-09T09-30-00.000Z'],
      ['a:b/c\\d*e', '-a-b-c-d-e'],
    ];
    for (const [suffix, expected] of cases) assert.strictEqual(formatOutputSuffix(suffix), expected);
  });
});
