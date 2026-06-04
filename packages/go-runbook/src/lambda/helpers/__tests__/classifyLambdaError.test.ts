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

  it('uses memory saturation as a last-resort OOM signal when no other signal is present', () => {
    assert.strictEqual(classifyLambdaError('REPORT ...', { memorySizeMb: 128, maxMemoryUsedMb: 128 }), 'out-of-memory');
  });

  it('does not let memory saturation override an explicit application or downstream error', () => {
    assert.strictEqual(
      classifyLambdaError('ERROR business logic failed', { memorySizeMb: 128, maxMemoryUsedMb: 130 }),
      'application-error',
    );
    assert.strictEqual(
      classifyLambdaError('External service pn-emd-integration returned errors', {
        memorySizeMb: 128,
        maxMemoryUsedMb: 128,
      }),
      'downstream',
    );
  });

  it('classifies throttle, downstream and application errors', () => {
    assert.strictEqual(classifyLambdaError('Rate Exceeded'), 'throttle');
    assert.strictEqual(
      classifyLambdaError('External service pn-emd-integration returned errors { status code 404 }'),
      'downstream',
    );
    assert.strictEqual(classifyLambdaError('ERROR Invalid source details header QRCODE'), 'application-error');
  });

  it('classifies application-error from a REPORT Status: error line', () => {
    assert.strictEqual(classifyLambdaError('REPORT RequestId: x Duration: 5.00 ms Status: error'), 'application-error');
  });

  it('falls back to unknown', () => {
    assert.strictEqual(classifyLambdaError('just an info line'), 'unknown');
  });
});
