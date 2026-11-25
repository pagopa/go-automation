import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyLambdaError } from '../classifyLambdaError.js';
import type { LambdaReportInfo } from '../parseLambdaReportLine.js';

/** A product downstream signature (SEND's, in SEND_LAMBDA_PROFILE). */
const DOWNSTREAM_SIGNATURES = [/External service\s+\S+\s+returned errors/i];
const DOWNSTREAM_ERROR = 'External service pn-emd-integration returned errors { status code 404 }';
const SATURATED: LambdaReportInfo = { memorySizeMb: 128, maxMemoryUsedMb: 128 };

describe('classifyLambdaError', () => {
  it('classifies each runtime and application signature', () => {
    const cases: ReadonlyArray<readonly [string, LambdaReportInfo | undefined, string]> = [
      ['REPORT ...', { status: 'timeout' }, 'timeout'],
      ['2026-... Task timed out after 10.00 seconds', undefined, 'timeout'],
      ['FATAL ERROR: JavaScript heap out of memory', undefined, 'out-of-memory'],
      ['Runtime exited with error: signal: killed', undefined, 'out-of-memory'],
      // Memory saturation is a last-resort OOM signal, never over an explicit error.
      ['REPORT ...', SATURATED, 'out-of-memory'],
      ['ERROR business logic failed', { memorySizeMb: 128, maxMemoryUsedMb: 130 }, 'application-error'],
      [DOWNSTREAM_ERROR, SATURATED, 'downstream'],
      ['Rate Exceeded', undefined, 'throttle'],
      [
        'ERROR Invoke Error {"errorType":"SlowDown","errorMessage":"Please reduce your request rate."}',
        undefined,
        'throttle',
      ],
      [DOWNSTREAM_ERROR, undefined, 'downstream'],
      ['ERROR Invalid source details header QRCODE', undefined, 'application-error'],
      ['REPORT RequestId: x Duration: 5.00 ms Status: error', undefined, 'application-error'],
      ['just an info line', undefined, 'unknown'],
    ];
    for (const [message, report, expected] of cases) {
      assert.strictEqual(classifyLambdaError(message, DOWNSTREAM_SIGNATURES, report), expected, message);
    }
  });

  it('does not classify a downstream error without a product signature', () => {
    assert.strictEqual(classifyLambdaError(DOWNSTREAM_ERROR, []), 'unknown');
  });

  it('classifies the same message the same way with a global or sticky signature, on every call', () => {
    const message = 'External service pn-emd-integration returned errors';
    for (const signature of [
      /External service\s+\S+\s+returned errors/gi,
      /External service\s+\S+\s+returned errors/y,
    ]) {
      const results = [1, 2, 3].map(() => classifyLambdaError(message, [signature]));

      assert.deepStrictEqual(results, ['downstream', 'downstream', 'downstream']);
      assert.strictEqual(signature.lastIndex, 0);
    }
  });
});
