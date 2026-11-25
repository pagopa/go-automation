import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOPollingError } from '../GOPollingError.js';

describe('GOPollingError', () => {
  it('is an Error named "GOPollingError" exposing kind and message', () => {
    const error = new GOPollingError('timeout', 'Polling timed out after 60 attempts');
    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, 'GOPollingError');
    assert.strictEqual(error.kind, 'timeout');
    assert.strictEqual(error.message, 'Polling timed out after 60 attempts');
  });
});
