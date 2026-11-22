import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { executeStep } from '../executeStep.js';

describe('executeStep', () => {
  it('returns the result of the step, or a failed result with the label when it throws', async () => {
    const ok = await executeStep({}, 'Read', async () => Promise.resolve({ success: true, output: 1 }));
    assert.deepStrictEqual(ok, { success: true, output: 1 });
    const failed = await executeStep({}, 'Read', async () => Promise.reject(new Error('AccessDenied')));
    assert.deepStrictEqual(failed, { success: false, error: 'Read failed: AccessDenied' });
  });

  it('throws again the error of a cancelled execution', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      executeStep({ signal: controller.signal }, 'Read', async () => Promise.reject(new Error('aborted'))),
      /aborted/,
    );
  });
});
