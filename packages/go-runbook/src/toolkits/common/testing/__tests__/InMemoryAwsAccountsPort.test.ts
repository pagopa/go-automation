import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { isAwsAccountError } from '../../accounts/AwsAccountError.js';
import { CORE, EXTRA, port } from '../../accounts/__tests__/fixtures.js';
import { UnexpectedServiceCallError } from '../UnexpectedServiceCallError.js';

describe('InMemoryAwsAccountsPort', () => {
  it('serves the given reader of a logical account', async () => {
    // Safe: the test only compares identity.
    const reader = {} as AWSCloudWatchLogsQueryService;
    const accounts = port({ environment: 'prod', readers: { [CORE]: reader } });
    await accounts.prepare([CORE]);
    assert.equal(accounts.cloudWatchLogsFor(CORE), reader);
  });

  it('gives an account without a reader a fake whose methods throw', async () => {
    const accounts = port({ environment: 'prod' });
    await accounts.prepare([EXTRA]);
    await assert.rejects(
      async () => accounts.cloudWatchLogsFor(EXTRA).query([], '', { start: new Date(0), end: new Date(0) }),
      UnexpectedServiceCallError,
    );
  });

  it('fails like an unreachable account when told so', async () => {
    const accounts = port({ environment: 'prod', unreachable: [EXTRA] });
    await assert.rejects(
      async () => accounts.prepare([CORE, EXTRA]),
      (error: unknown) => isAwsAccountError(error) && error.code === 'AWS_ACCOUNT_UNREACHABLE',
    );
  });

  it('binds to an occurrence with fresh state, leaving the original port unchanged', async () => {
    const base = port({ environment: 'prod' });
    await base.prepare([CORE]);
    const bound = base.bindToOccurrence({ accountId: '000000000201', region: 'eu-south-1' });
    assert.equal(bound.environment(), 'uat');
    assert.equal(bound.hasOccurrence(), true);
    assert.deepEqual(bound.resolvedAccounts(), []);
    assert.equal(base.environment(), 'prod');
    assert.equal(base.resolvedAccounts().length, 1);
  });
});
