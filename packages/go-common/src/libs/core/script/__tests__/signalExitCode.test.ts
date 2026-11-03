import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { signalExitCode } from '../signalExitCode.js';

describe('signalExitCode', () => {
  it('follows the 128 + signal number convention', () => {
    assert.equal(signalExitCode('SIGINT'), 130);
    assert.equal(signalExitCode('SIGQUIT'), 131);
    assert.equal(signalExitCode('SIGTERM'), 143);
  });
});
