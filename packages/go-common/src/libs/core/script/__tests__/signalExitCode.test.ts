import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { signalExitCode } from '../signalExitCode.js';

describe('signalExitCode', () => {
  it('follows the 128 + POSIX signal number convention', () => {
    assert.equal(signalExitCode('SIGINT'), 130);
    assert.equal(signalExitCode('SIGQUIT'), 131);
    assert.equal(signalExitCode('SIGTERM'), 143);
  });

  it('returns 1 for a signal GOScript does not handle', () => {
    assert.equal(signalExitCode('SIGHUP'), 1);
    assert.equal(signalExitCode('SIGUSR1'), 1);
  });
});
