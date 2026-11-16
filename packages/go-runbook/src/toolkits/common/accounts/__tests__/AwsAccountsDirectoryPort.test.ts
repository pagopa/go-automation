import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ALIAS, CORE, EXTRA, port, REGION, rejectsWith } from './fixtures.js';

describe('AwsAccountsDirectoryPort', () => {
  it('derives the environment from the occurrence account', () => {
    const occurrence = { accountId: '000000000202', region: REGION };
    assert.equal(port({ occurrence }).environment(), 'uat');
    assert.equal(port({ occurrence }).hasOccurrence(), true);
  });

  it('rejects an occurrence outside the directory or in another region', () => {
    assert.throws(
      () => port({ occurrence: { accountId: '000000000999', region: REGION } }).environment(),
      rejectsWith('AWS_OCCURRENCE_ACCOUNT_MISMATCH'),
    );
    assert.throws(
      () => port({ occurrence: { accountId: '000000000201', region: 'eu-west-1' } }).environment(),
      rejectsWith('AWS_OCCURRENCE_ACCOUNT_MISMATCH'),
    );
  });

  it('uses the configured environment without an occurrence, and requires one', () => {
    assert.equal(port({ environment: 'prod' }).environment(), 'prod');
    assert.equal(port({ environment: 'prod' }).hasOccurrence(), false);
    assert.throws(() => port().environment(), rejectsWith('AWS_ACCOUNT_ENVIRONMENT_NOT_CONFIGURED'));
  });

  it('resolves a logical account in the environment, or reports the missing entry', () => {
    assert.deepEqual(port({ environment: 'uat' }).resolve(EXTRA), {
      account: EXTRA,
      environment: 'uat',
      accountId: '000000000202',
      region: REGION,
    });
    assert.throws(() => port({ environment: 'dev' }).resolve(EXTRA), rejectsWith('AWS_ACCOUNT_NOT_CONFIGURED'));
  });

  it('finds the logical account of the occurrence among the candidates', () => {
    const accounts = port({ occurrence: { accountId: '000000000102', region: REGION } });
    assert.equal(accounts.accountOfOccurrence([CORE, EXTRA]), EXTRA);
    assert.equal(accounts.accountOfOccurrence([CORE]), undefined);
    assert.equal(port({ environment: 'prod' }).accountOfOccurrence([CORE, EXTRA]), undefined);
  });

  it('prepares each account once and serves only prepared readers', async () => {
    const accounts = port({ environment: 'dev' });
    await accounts.prepare([CORE, ALIAS, CORE]);
    assert.deepEqual(
      accounts.resolvedAccounts().map(({ account }) => account),
      [CORE, ALIAS],
    );
    assert.ok(accounts.cloudWatchLogsFor(CORE) !== undefined);
    assert.throws(() => accounts.cloudWatchLogsFor(EXTRA), /was not prepared/u);
  });
});
