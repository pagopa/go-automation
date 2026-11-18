import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AWSServiceProvider } from '@pagopa/go-aws/all';
import type { GOHttpClient } from '@pagopa/go-common/http';

import { RuntimeAwsAccountsPort } from '../../accounts/RuntimeAwsAccountsPort.js';
import { createServiceRegistry } from '../createServiceRegistry.js';
import { NOOP_RUNBOOK_REPORTER } from '../../../engine/reporting/NOOP_RUNBOOK_REPORTER.js';

describe('createServiceRegistry', () => {
  const cloudWatchLogs = {};
  const cloudWatchMetrics = {};
  const athena = {};
  const dynamoDB = {};
  const services = { cloudWatchLogs, cloudWatchMetrics, athena, dynamoDB } as unknown as AWSServiceProvider;
  const http = {} as GOHttpClient;

  it('takes the AWS services from the provider and the reporter from the caller', () => {
    const registry = createServiceRegistry({ services, http }, NOOP_RUNBOOK_REPORTER);

    assert.strictEqual(registry.cloudWatchLogs, cloudWatchLogs);
    assert.strictEqual(registry.cloudWatchMetrics, cloudWatchMetrics);
    assert.strictEqual(registry.athena, athena);
    assert.strictEqual(registry.dynamodb, dynamoDB);
    assert.strictEqual(registry.http, http);
    // go-rta-check renders its own table: a console default here would print the
    // per-step runbook narrative over it.
    assert.strictEqual(registry.reporter, NOOP_RUNBOOK_REPORTER);
  });

  it('adds the account port only when the account configuration is given', () => {
    assert.strictEqual(createServiceRegistry({ services, http }, NOOP_RUNBOOK_REPORTER).awsAccounts, undefined);
    const registry = createServiceRegistry(
      {
        services,
        http,
        accounts: { directory: ['shop/core/prod=000000000101'], binding: 'oam', region: 'eu-south-1' },
      },
      NOOP_RUNBOOK_REPORTER,
    );
    assert.ok(registry.awsAccounts instanceof RuntimeAwsAccountsPort);
    assert.throws(
      () =>
        createServiceRegistry(
          { services, http, accounts: { directory: [], binding: 'profiles', region: 'eu-south-1' } },
          NOOP_RUNBOOK_REPORTER,
        ),
      /profiles/u,
    );
  });
});
