import { describe, it } from 'node:test';
import assert from 'node:assert';

import { splitMultiline } from '../tableRenderer/splitMultiline.js';

describe('splitMultiline', () => {
  it('returns a single padded line for input without newlines', () => {
    const result = splitMultiline('foo', 5, 'left');
    assert.deepStrictEqual([...result], ['foo  ']);
  });

  it('returns one padded entry per line for multi-line input', () => {
    const result = splitMultiline('a\nbb\nccc', 5, 'left');
    assert.deepStrictEqual([...result], ['a    ', 'bb   ', 'ccc  ']);
  });

  it('preserves empty lines between content (consecutive newlines)', () => {
    const result = splitMultiline('a\n\nb', 3, 'left');
    assert.deepStrictEqual([...result], ['a  ', '   ', 'b  ']);
  });

  it('handles a single empty string as a single padded blank line', () => {
    const result = splitMultiline('', 4, 'left');
    assert.deepStrictEqual([...result], ['    ']);
  });

  it('respects right alignment per line', () => {
    const result = splitMultiline('a\nbb', 4, 'right');
    assert.deepStrictEqual([...result], ['   a', '  bb']);
  });

  it('respects center alignment per line', () => {
    const result = splitMultiline('a\nbbb', 5, 'center');
    assert.deepStrictEqual([...result], ['  a  ', ' bbb ']);
  });
});
