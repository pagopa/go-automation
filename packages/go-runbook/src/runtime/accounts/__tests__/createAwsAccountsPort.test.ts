import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { parseAwsLogicalAccount } from '../../../toolkits/common/accounts/parseAwsLogicalAccount.js';
import { createAwsAccountsPort } from '../createAwsAccountsPort.js';

// Safe: never queried in these tests.
const MONITORING = {} as AWSCloudWatchLogsQueryService;

describe('createAwsAccountsPort', () => {
  it('builds a port from the raw configuration', () => {
    const accounts = createAwsAccountsPort(
      { directory: ['shop/core/uat=000000000201'], binding: 'oam', environment: 'uat', region: 'eu-south-1' },
      { monitoring: MONITORING },
    );
    assert.equal(accounts.resolve(parseAwsLogicalAccount('shop/core')).accountId, '000000000201');
  });

  it('rejects a malformed directory', () => {
    assert.throws(
      () =>
        createAwsAccountsPort(
          { directory: ['shop/core=1'], binding: 'oam', region: 'eu-south-1' },
          { monitoring: MONITORING },
        ),
      /Invalid AWS account directory entry/u,
    );
  });
});
