import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPath, smartTruncate, truncatePath, truncateText } from '../GOStringUtils.js';

describe('GOStringUtils', () => {
  it('detects path-like strings', () => {
    assert.strictEqual(isPath('/tmp/file.txt'), true);
    assert.strictEqual(isPath('C:\\tmp\\file.txt'), true);
    assert.strictEqual(isPath('./relative/file'), true);
    assert.strictEqual(isPath('archive.zip'), true);
    assert.strictEqual(isPath('plain text'), false);
  });

  it('smartly truncates paths and regular text', () => {
    assert.strictEqual(smartTruncate('', { maxLength: 10, ellipsis: '...' }), '');
    assert.strictEqual(smartTruncate('abc', { maxLength: 0, ellipsis: '...' }), '');
    assert.strictEqual(smartTruncate('abc', { maxLength: 5, ellipsis: '...' }), 'abc');
    assert.strictEqual(smartTruncate('abcdef', { maxLength: 2, ellipsis: '...' }), '..');
    assert.strictEqual(
      smartTruncate('/very/long/path/file.txt', { maxLength: 15, ellipsis: '...' }),
      '...ath/file.txt',
    );
    assert.strictEqual(smartTruncate('a very long sentence', { maxLength: 10, ellipsis: '...' }), 'a very ...');
    assert.strictEqual(
      smartTruncate('not-a-path-but-force-start', { maxLength: 12, ellipsis: '...', forcePathStyle: true }),
      '...rce-start',
    );
  });

  it('exposes path and text truncation wrappers', () => {
    assert.strictEqual(truncatePath('/a/b/c/d/file.txt', 12, '...'), '.../file.txt');
    assert.strictEqual(truncateText('hello world', 8, '...'), 'hello...');
  });
});
