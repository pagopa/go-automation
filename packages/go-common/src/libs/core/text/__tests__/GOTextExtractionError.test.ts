import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOTextExtractionError } from '../GOTextExtractionError.js';

describe('GOTextExtractionError', () => {
  it('exposes filePath, mimeType, message and cause', () => {
    const cause = new Error('underlying I/O error');
    const error = new GOTextExtractionError('failed to parse', '/tmp/x.pdf', 'application/pdf', cause);

    assert.strictEqual(error.name, 'GOTextExtractionError');
    assert.strictEqual(error.message, 'failed to parse');
    assert.strictEqual(error.filePath, '/tmp/x.pdf');
    assert.strictEqual(error.mimeType, 'application/pdf');
    assert.strictEqual(error.cause, cause);
    assert.ok(error instanceof Error);
  });

  it('accepts a missing cause and mimeType', () => {
    const error = new GOTextExtractionError('bare', '/tmp/x');
    assert.strictEqual(error.filePath, '/tmp/x');
    assert.strictEqual(error.mimeType, undefined);
    assert.strictEqual(error.cause, undefined);
  });
});
