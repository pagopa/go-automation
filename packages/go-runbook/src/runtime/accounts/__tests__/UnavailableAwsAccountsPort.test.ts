import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isAwsAccountError } from '../../../toolkits/common/accounts/AwsAccountError.js';
import { parseAwsLogicalAccount } from '../../../toolkits/common/accounts/parseAwsLogicalAccount.js';
import { UnavailableAwsAccountsPort } from '../UnavailableAwsAccountsPort.js';

const invalid = (error: unknown): boolean =>
  isAwsAccountError(error) && error.code === 'AWS_ACCOUNT_DIRECTORY_INVALID' && /malformed entry/u.test(error.message);

describe('UnavailableAwsAccountsPort', () => {
  it('fails every account resolution with AWS_ACCOUNT_DIRECTORY_INVALID and the reason', async () => {
    const port = new UnavailableAwsAccountsPort('malformed entry');
    const core = parseAwsLogicalAccount('shop/core');
    assert.throws(() => port.environment(), invalid);
    assert.throws(() => port.resolve(core), invalid);
    assert.throws(() => port.cloudWatchLogsFor(core), invalid);
    await assert.rejects(async () => port.prepare(), invalid);
  });

  it('stays the same port for every occurrence and reports nothing read', () => {
    const port = new UnavailableAwsAccountsPort('malformed entry');
    assert.equal(port.bindToOccurrence(), port);
    assert.equal(port.hasOccurrence(), false);
    assert.equal(port.accountOfOccurrence(), undefined);
    assert.deepEqual(port.resolvedAccounts(), []);
  });
});
