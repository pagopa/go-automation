import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { truncateText } from '../extractors/truncateText.js';

describe('truncateText', () => {
  it('returns input unchanged when below limit', () => {
    const r = truncateText('hello', 1024);
    assert.strictEqual(r.text, 'hello');
    assert.strictEqual(r.truncated, false);
  });

  it('truncates ASCII at the byte boundary', () => {
    const r = truncateText('abcdef', 3);
    assert.strictEqual(r.text, 'abc');
    assert.strictEqual(r.truncated, true);
  });

  it('does not split multi-byte characters', () => {
    // 'è' is 2 bytes in UTF-8.
    const r = truncateText('aè', 2);
    assert.strictEqual(r.text, 'a');
    assert.strictEqual(r.truncated, true);
  });

  it('handles emoji correctly', () => {
    // 🎉 is 4 bytes
    const r = truncateText('a🎉', 3);
    assert.strictEqual(r.text, 'a');
    assert.strictEqual(r.truncated, true);
  });

  it('handles maxBytes = 0', () => {
    const r = truncateText('whatever', 0);
    assert.strictEqual(r.text, '');
    assert.strictEqual(r.truncated, true);
  });
});
