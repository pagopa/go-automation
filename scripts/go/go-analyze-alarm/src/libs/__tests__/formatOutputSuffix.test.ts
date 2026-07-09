import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatOutputSuffix } from '../formatOutputSuffix.js';

describe('formatOutputSuffix', () => {
  it('returns an empty string when there is no meaningful suffix', () => {
    assert.strictEqual(formatOutputSuffix(undefined), '');
    assert.strictEqual(formatOutputSuffix(''), '');
    assert.strictEqual(formatOutputSuffix('   '), '');
  });

  it('prefixes the suffix and replaces reserved file-name characters', () => {
    assert.strictEqual(formatOutputSuffix('2026-07-09T09:30:00.000Z'), '-2026-07-09T09-30-00.000Z');
    assert.strictEqual(formatOutputSuffix('a:b/c\\d*e'), '-a-b-c-d-e');
  });

  it('keeps distinct ISO timestamps distinct', () => {
    assert.notStrictEqual(
      formatOutputSuffix('2026-07-09T09:30:00.000Z'),
      formatOutputSuffix('2026-07-09T09:31:00.000Z'),
    );
  });
});
