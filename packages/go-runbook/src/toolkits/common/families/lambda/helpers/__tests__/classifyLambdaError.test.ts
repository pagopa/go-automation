import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLambdaError } from '../classifyLambdaError.js';
import type { LambdaReportInfo } from '../parseLambdaReportLine.js';

/** A product downstream signature (SEND's, in SEND_LAMBDA_PROFILE). */
const DOWNSTREAM_SIGNATURES = [/External service\s+\S+\s+returned errors/i];

function classify(message: string, report?: LambdaReportInfo): string {
  return classifyLambdaError(message, DOWNSTREAM_SIGNATURES, report);
}

describe('classifyLambdaError', () => {
  it('classifies timeout from the REPORT status', () => {
    assert.strictEqual(classify('REPORT ...', { status: 'timeout' }), 'timeout');
  });

  it('classifies timeout from a Task timed out message', () => {
    assert.strictEqual(classify('2026-... Task timed out after 10.00 seconds'), 'timeout');
  });

  it('classifies out-of-memory from heap and signal:killed signatures', () => {
    assert.strictEqual(classify('FATAL ERROR: JavaScript heap out of memory'), 'out-of-memory');
    assert.strictEqual(classify('Runtime exited with error: signal: killed'), 'out-of-memory');
  });

  it('uses memory saturation as a last-resort OOM signal when no other signal is present', () => {
    assert.strictEqual(classify('REPORT ...', { memorySizeMb: 128, maxMemoryUsedMb: 128 }), 'out-of-memory');
  });

  it('does not let memory saturation override an explicit application or downstream error', () => {
    assert.strictEqual(
      classify('ERROR business logic failed', { memorySizeMb: 128, maxMemoryUsedMb: 130 }),
      'application-error',
    );
    assert.strictEqual(
      classify('External service pn-emd-integration returned errors', {
        memorySizeMb: 128,
        maxMemoryUsedMb: 128,
      }),
      'downstream',
    );
  });

  it('classifies throttle, downstream and application errors', () => {
    assert.strictEqual(classify('Rate Exceeded'), 'throttle');
    assert.strictEqual(
      classify('ERROR Invoke Error {"errorType":"SlowDown","errorMessage":"Please reduce your request rate."}'),
      'throttle',
    );
    assert.strictEqual(
      classify('External service pn-emd-integration returned errors { status code 404 }'),
      'downstream',
    );
    assert.strictEqual(classify('ERROR Invalid source details header QRCODE'), 'application-error');
  });

  it('classifies application-error from a REPORT Status: error line', () => {
    assert.strictEqual(classify('REPORT RequestId: x Duration: 5.00 ms Status: error'), 'application-error');
  });

  it('falls back to unknown', () => {
    assert.strictEqual(classify('just an info line'), 'unknown');
  });
  it('does not classify a downstream error without a product signature', () => {
    assert.strictEqual(
      classifyLambdaError('External service pn-emd-integration returned errors { status code 404 }', []),
      'unknown',
    );
  });
});
