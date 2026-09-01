import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Core } from '@go-automation/go-common';

import { createServiceRegistry } from '../createServiceRegistry.js';
import { NOOP_RUNBOOK_REPORTER } from '../../services/reporters/NOOP_RUNBOOK_REPORTER.js';

describe('createServiceRegistry', () => {
  it('uses the generic Athena service from the script AWS provider', () => {
    const cloudWatchLogs = {};
    const cloudWatchMetrics = {};
    const athena = {};
    const dynamoDB = {};

    const script = {
      aws: {
        services: {
          cloudWatchLogs,
          cloudWatchMetrics,
          athena,
          dynamoDB,
        },
      },
    } as unknown as Core.GOScript;

    const registry = createServiceRegistry(script, NOOP_RUNBOOK_REPORTER);

    assert.strictEqual(registry.cloudWatchLogs, cloudWatchLogs);
    assert.strictEqual(registry.cloudWatchMetrics, cloudWatchMetrics);
    assert.strictEqual(registry.athena, athena);
    assert.strictEqual(registry.dynamodb, dynamoDB);
  });

  it('takes the narrative reporter from the caller and never defaults to the script logger', () => {
    const script = {
      aws: { services: { cloudWatchLogs: {}, cloudWatchMetrics: {}, athena: {}, dynamoDB: {} } },
      logger: { text: () => assert.fail('the script logger must not be wired implicitly') },
    } as unknown as Core.GOScript;

    const registry = createServiceRegistry(script, NOOP_RUNBOOK_REPORTER);

    // go-rta-check renders its own table: a console default here would print the
    // per-step runbook narrative over it.
    assert.strictEqual(registry.reporter, NOOP_RUNBOOK_REPORTER);
    registry.reporter.section('nothing should reach the script logger');
    registry.reporter.add({ label: 'nor this' });
    registry.reporter.flush();
  });
});
