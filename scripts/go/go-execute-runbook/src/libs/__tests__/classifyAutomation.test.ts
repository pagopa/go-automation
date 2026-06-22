import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyAutomationFailure } from '../classifyAutomationFailure.js';
import { classifyAutomationOutcome } from '../classifyAutomationOutcome.js';

describe('automation classifiers', () => {
  it('maps all six runbook outcomes to the WT contract', () => {
    assert.strictEqual(classifyAutomationOutcome({ status: 'HIT', matchedCaseIds: [] }), 'KNOWN_CASE');
    assert.strictEqual(classifyAutomationOutcome({ status: 'MISS', matchedCaseIds: [] }), 'UNKNOWN_CASE');
    assert.strictEqual(classifyAutomationOutcome({ status: 'NO-DATA', matchedCaseIds: [] }), 'NO_DATA');
    assert.strictEqual(classifyAutomationOutcome({ status: 'NO_RUNBOOK', matchedCaseIds: [] }), 'NO_RUNBOOK');
    assert.strictEqual(
      classifyAutomationOutcome({ status: 'CONFIG-ERROR', matchedCaseIds: [] }),
      'CONFIGURATION_ERROR',
    );
    assert.strictEqual(classifyAutomationOutcome({ status: 'EXECUTION-ERROR', matchedCaseIds: [] }), 'EXECUTION_ERROR');
  });

  it('does not convert generic aborts to cancellation and defaults unknown errors to retry', () => {
    assert.strictEqual(classifyAutomationFailure(new Error('abort'), 'SHUTDOWN'), 'RETRY_MESSAGE');
    assert.strictEqual(classifyAutomationFailure(new Error('unknown')), 'RETRY_MESSAGE');
    assert.strictEqual(classifyAutomationFailure(new Error('cancel'), 'USER_CANCELLED'), 'CANCEL_EXECUTION');
    assert.strictEqual(
      classifyAutomationFailure(Object.assign(new Error('bad command'), { workerFailureCode: 'INVALID_COMMAND' })),
      'FAIL_EXECUTION',
    );
  });
});
