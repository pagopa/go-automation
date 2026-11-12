import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AWSServiceProvider } from '@pagopa/go-aws/all';
import type { GOHttpClient } from '@pagopa/go-common/http';

import { createServiceRegistry } from '../createServiceRegistry.js';
import { NOOP_RUNBOOK_REPORTER } from '../../registry/reporters/NOOP_RUNBOOK_REPORTER.js';

describe('createServiceRegistry', () => {
  it('uses the generic Athena service from the AWS service provider', () => {
    const cloudWatchLogs = {};
    const cloudWatchMetrics = {};
    const athena = {};
    const dynamoDB = {};

    const services = { cloudWatchLogs, cloudWatchMetrics, athena, dynamoDB } as unknown as AWSServiceProvider;
    const http = {} as GOHttpClient;

    const registry = createServiceRegistry({ services, http }, NOOP_RUNBOOK_REPORTER);

    assert.strictEqual(registry.cloudWatchLogs, cloudWatchLogs);
    assert.strictEqual(registry.cloudWatchMetrics, cloudWatchMetrics);
    assert.strictEqual(registry.athena, athena);
    assert.strictEqual(registry.dynamodb, dynamoDB);
    assert.strictEqual(registry.http, http);
  });

  it('takes the narrative reporter from the caller and never defaults to a console reporter', () => {
    const services = {
      cloudWatchLogs: {},
      cloudWatchMetrics: {},
      athena: {},
      dynamoDB: {},
    } as unknown as AWSServiceProvider;

    const registry = createServiceRegistry({ services, http: {} as GOHttpClient }, NOOP_RUNBOOK_REPORTER);

    // go-rta-check renders its own table: a console default here would print the
    // per-step runbook narrative over it.
    assert.strictEqual(registry.reporter, NOOP_RUNBOOK_REPORTER);
    registry.reporter.section('nothing should reach the script logger');
    registry.reporter.add({ label: 'nor this' });
    registry.reporter.flush();
  });
});
