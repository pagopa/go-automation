import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResolvedColumn } from '../tableRenderer/ResolvedColumn.js';
import { TABLE_CHARS_BY_STYLE } from '../tableRenderer/TableChars.js';
import { renderSeparator } from '../tableRenderer/renderSeparator.js';

const noopFormatter = (v: unknown): string => String(v);

const cols: ReadonlyArray<ResolvedColumn> = [
  { header: 'A', key: 'a', width: 4, align: 'left', formatter: noopFormatter },
  { header: 'B', key: 'b', width: 5, align: 'left', formatter: noopFormatter },
];

describe('renderSeparator', () => {
  it('renders each position for each table style', () => {
    const expected: Readonly<Record<keyof typeof TABLE_CHARS_BY_STYLE, readonly [string, string, string]>> = {
      full: ['┌────┬─────┐', '├────┼─────┤', '└────┴─────┘'],
      // No outer edges: only the mid separator, joined by the cross.
      'border-less': ['', '────┼─────', ''],
      compact: ['', '', ''],
    };
    for (const [style, [top, mid, bottom]] of Object.entries(expected)) {
      const chars = TABLE_CHARS_BY_STYLE[style as keyof typeof TABLE_CHARS_BY_STYLE];
      assert.strictEqual(renderSeparator(cols, chars, 'top'), top, `${style} top`);
      assert.strictEqual(renderSeparator(cols, chars, 'mid'), mid, `${style} mid`);
      assert.strictEqual(renderSeparator(cols, chars, 'bottom'), bottom, `${style} bottom`);
    }
  });

  it('returns empty string for columns: []', () => {
    assert.strictEqual(renderSeparator([], TABLE_CHARS_BY_STYLE.full, 'top'), '');
  });
});
