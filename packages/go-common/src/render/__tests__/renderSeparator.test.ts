import { describe, it } from 'node:test';
import assert from 'node:assert';

import type { ResolvedColumn } from '../tableRenderer/ResolvedColumn.js';
import { TABLE_CHARS_BY_STYLE } from '../tableRenderer/TableChars.js';
import { renderSeparator } from '../tableRenderer/renderSeparator.js';

const noopFormatter = (v: unknown): string => String(v);

const cols: ReadonlyArray<ResolvedColumn> = [
  { header: 'A', key: 'a', width: 4, align: 'left', formatter: noopFormatter },
  { header: 'B', key: 'b', width: 5, align: 'left', formatter: noopFormatter },
];

describe('renderSeparator', () => {
  it('returns empty string for columns: []', () => {
    assert.strictEqual(renderSeparator([], TABLE_CHARS_BY_STYLE.full, 'top'), '');
  });

  describe('full style', () => {
    it('renders top separator with corners and tee', () => {
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE.full, 'top'), '┌────┬─────┐');
    });

    it('renders mid separator with cross', () => {
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE.full, 'mid'), '├────┼─────┤');
    });

    it('renders bottom separator with corners and tee', () => {
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE.full, 'bottom'), '└────┴─────┘');
    });
  });

  describe('border-less style', () => {
    it('returns empty for top and bottom', () => {
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE['border-less'], 'top'), '');
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE['border-less'], 'bottom'), '');
    });

    it('renders mid with cross but no outer corners', () => {
      // No left/right edges; mid character (┼) joins horizontal segments.
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE['border-less'], 'mid'), '────┼─────');
    });
  });

  describe('compact style', () => {
    it('returns empty string for every position', () => {
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE.compact, 'top'), '');
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE.compact, 'mid'), '');
      assert.strictEqual(renderSeparator(cols, TABLE_CHARS_BY_STYLE.compact, 'bottom'), '');
    });
  });
});
