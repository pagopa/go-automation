import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ExecutionAbortCoordinator } from '../ExecutionAbortCoordinator.js';

describe('ExecutionAbortCoordinator', () => {
  it('preserves the first typed cause and aborts exactly once', () => {
    const coordinator = new ExecutionAbortCoordinator();
    let aborts = 0;
    coordinator.signal.addEventListener('abort', () => {
      aborts += 1;
    });

    coordinator.abort('USER_CANCELLED');
    coordinator.abort('TIME_BUDGET');

    assert.strictEqual(coordinator.cause, 'USER_CANCELLED');
    assert.strictEqual(coordinator.signal.aborted, true);
    assert.strictEqual(aborts, 1);
  });
});
