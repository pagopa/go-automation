import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServiceRegistry } from '../createTestServiceRegistry.js';
import { CollectingRunbookReporter } from '../reporters/CollectingRunbookReporter.js';
import { NOOP_RUNBOOK_REPORTER } from '../reporters/NOOP_RUNBOOK_REPORTER.js';

describe('createTestServiceRegistry', () => {
  it('defaults the reporter to the NOOP one', () => {
    assert.strictEqual(createTestServiceRegistry().reporter, NOOP_RUNBOOK_REPORTER);
  });

  it('uses the reporter a test provides', () => {
    const reporter = new CollectingRunbookReporter();

    assert.strictEqual(createTestServiceRegistry({ reporter }).reporter, reporter);
  });

  it('keeps the NOOP reporter when the override is explicitly undefined', () => {
    // A conditionally-built overrides object easily yields `{ reporter: undefined }`;
    // installing that would fail the test deep inside a step with an unreadable
    // "Cannot read properties of undefined (reading 'section')".
    assert.strictEqual(createTestServiceRegistry({ reporter: undefined }).reporter, NOOP_RUNBOOK_REPORTER);
  });

  it('carries the stub services a test provides', () => {
    const cloudWatchLogs = { query: (): void => undefined };

    assert.strictEqual(createTestServiceRegistry({ cloudWatchLogs }).cloudWatchLogs, cloudWatchLogs);
  });

  it('leaves a service the test did not provide absent, so touching it fails loudly', () => {
    const services = createTestServiceRegistry();

    assert.strictEqual(Object.hasOwn(services, 'cloudWatchLogs'), false);
    assert.throws(() => {
      // The access itself throws, before any promise exists: the arrow must stay
      // synchronous, or `assert.throws` would never see the error.
      void services.cloudWatchLogs.query([], '', { start: new Date(), end: new Date() });
    }, TypeError);
  });

  it('treats an explicitly undefined service override as absent too', () => {
    const services = createTestServiceRegistry({ cloudWatchLogs: undefined });

    assert.strictEqual(Object.hasOwn(services, 'cloudWatchLogs'), false);
  });
});
