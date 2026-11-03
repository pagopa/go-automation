import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Dispatch } from '@go-automation/go-send';

import { DispatchShutdown } from '../DispatchShutdown.js';

/** Session double that counts the stop requests. */
class FakeSession {
  public stops = 0;

  public stop(): void {
    this.stops += 1;
  }

  public get session(): Dispatch.DispatchSession {
    return this as unknown as Dispatch.DispatchSession;
  }
}

describe('DispatchShutdown', () => {
  it('does nothing when no run is attached (normal end of the script)', async () => {
    const shutdown = new DispatchShutdown();
    await shutdown.stopAndWait();
    assert.equal(shutdown.wasInterrupted, false);
  });

  it('stops the session and waits until the output is materialized', async () => {
    const shutdown = new DispatchShutdown();
    const fake = new FakeSession();
    shutdown.attach(fake.session);

    let resolved = false;
    const waiting = shutdown.stopAndWait().then(() => {
      resolved = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(fake.stops, 1);
    assert.equal(resolved, false, 'still waiting for done()');
    assert.equal(shutdown.wasInterrupted, true);

    shutdown.done();
    await waiting;
    assert.equal(resolved, true);
  });
});
