import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLambdaError } from '../classifyLambdaError.js';

describe('classifyLambdaError', () => {
  it('classifies timeout from the REPORT status', () => {
    assert.strictEqual(classifyLambdaError('REPORT ...', { status: 'timeout' }), 'timeout');
  });

  it('classifies timeout from a Task timed out message', () => {
    assert.strictEqual(classifyLambdaError('2026-... Task timed out after 10.00 seconds'), 'timeout');
  });

  it('classifies out-of-memory from heap and signal:killed signatures', () => {
    assert.strictEqual(classifyLambdaError('FATAL ERROR: JavaScript heap out of memory'), 'out-of-memory');
    assert.strictEqual(classifyLambdaError('Runtime exited with error: signal: killed'), 'out-of-memory');
  });

  it('classifies out-of-memory when max memory used reaches memory size', () => {
    assert.strictEqual(classifyLambdaError('REPORT ...', { memorySizeMb: 128, maxMemoryUsedMb: 128 }), 'out-of-memory');
  });

  it('classifies throttle, downstream and application errors', () => {
    assert.strictEqual(classifyLambdaError('Rate Exceeded'), 'throttle');
    assert.strictEqual(
      classifyLambdaError('External service pn-emd-integration returned errors { status code 404 }'),
      'downstream',
    );
    assert.strictEqual(classifyLambdaError('ERROR Invalid source details header QRCODE'), 'application-error');
  });

  it('falls back to unknown', () => {
    assert.strictEqual(classifyLambdaError('just an info line'), 'unknown');
  });
});
