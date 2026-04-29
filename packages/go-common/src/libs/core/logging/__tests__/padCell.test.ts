import { describe, it } from 'node:test';
import assert from 'node:assert';

import { padCell } from '../tableRenderer/padCell.js';

describe('padCell', () => {
  it('returns empty string for width <= 0', () => {
    assert.strictEqual(padCell('hello', 0, 'left'), '');
    assert.strictEqual(padCell('hello', -1, 'left'), '');
  });

  it('returns the input unchanged when its width matches exactly', () => {
    assert.strictEqual(padCell('abc', 3, 'left'), 'abc');
    assert.strictEqual(padCell('abc', 3, 'right'), 'abc');
    assert.strictEqual(padCell('abc', 3, 'center'), 'abc');
  });

  it('pads left-aligned text with trailing spaces', () => {
    assert.strictEqual(padCell('hi', 5, 'left'), 'hi   ');
  });

  it('pads right-aligned text with leading spaces', () => {
    assert.strictEqual(padCell('hi', 5, 'right'), '   hi');
  });

  it('pads center-aligned with floor on the left and ceil on the right', () => {
    // 5 cells - 2 cells of "hi" = 3 to split → 1 left, 2 right
    assert.strictEqual(padCell('hi', 5, 'center'), ' hi  ');
  });

  it('truncates with ellipsis when text exceeds width', () => {
    assert.strictEqual(padCell('hello world', 6, 'left'), 'hello…');
  });

  it('returns ellipsis alone when width is 1 and text overflows', () => {
    assert.strictEqual(padCell('hello', 1, 'left'), '…');
  });

  it('preserves ANSI escape codes during padding', () => {
    const colored = '\x1b[31mhi\x1b[0m';
    const padded = padCell(colored, 5, 'left');
    // 2 visible cells + 3 trailing spaces; ANSI codes intact
    assert.strictEqual(padded, `${colored}   `);
  });

  it('respects CJK 2-cell width when padding', () => {
    // '日' = 2 cells; pad to 5 → 3 trailing spaces
    assert.strictEqual(padCell('日', 5, 'left'), '日   ');
  });

  it('handles wide-char boundary on truncation by inserting space before ellipsis', () => {
    // 2-cell wide char + ellipsis (1 cell) = 3 cells total. Width 4 means we
    // can't fit a second wide char (would overflow), so we pad with a space
    // before the ellipsis to land exactly on width.
    const result = padCell('日本語', 4, 'left');
    assert.strictEqual(result, '日 …');
  });
});
