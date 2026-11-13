import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOPollingError } from '../GOPollingError.js';

describe('GOPollingError', () => {
  it('exposes kind and message', () => {
    const error = new GOPollingError('timeout', 'Polling timed out after 60 attempts');
    assert.strictEqual(error.kind, 'timeout');
    assert.strictEqual(error.message, 'Polling timed out after 60 attempts');
  });

  it('sets name to "GOPollingError"', () => {
    const error = new GOPollingError('aborted', 'aborted during sleep');
    assert.strictEqual(error.name, 'GOPollingError');
  });

  it('is an instance of Error', () => {
    const error = new GOPollingError('budget-exceeded', 'budget exceeded');
    assert.ok(error instanceof Error);
    assert.ok(error instanceof GOPollingError);
  });

  it('supports the "exhausted" kind for retry context', () => {
    const error = new GOPollingError('exhausted', 'retry exhausted after 3 attempts');
    assert.strictEqual(error.kind, 'exhausted');
  });

  it('preserves a stack trace', () => {
    const error = new GOPollingError('timeout', 'test');
    assert.ok(typeof error.stack === 'string' && error.stack.length > 0);
  });
});
