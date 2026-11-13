import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AwsAccountSelection } from '../AwsAccountSelection.js';
import type { InMemoryAwsAccountsPortOptions } from '../../testing/InMemoryAwsAccountsPortOptions.js';
import { selectAwsAccounts } from '../selectAwsAccounts.js';
import { ALIAS, CORE, EXTRA, port, REGION, rejectsWith } from './fixtures.js';

const BOTH: AwsAccountSelection = { subject: 'both', accounts: [CORE, EXTRA], scope: 'every-account' };
const OF_OCCURRENCE: AwsAccountSelection = {
  subject: 'occurrence',
  accounts: [CORE, EXTRA],
  scope: 'occurrence-account',
};
const PROD_ONLY: AwsAccountSelection = {
  subject: 'prod-only',
  accounts: [EXTRA],
  scope: 'occurrence-account',
  environments: ['prod'],
};

const ids = (selection: AwsAccountSelection, options: Partial<InMemoryAwsAccountsPortOptions>): ReadonlyArray<string> =>
  selectAwsAccounts(port(options), selection).map(({ accountId }) => accountId);

describe('selectAwsAccounts', () => {
  it('reads every account in the environment of the occurrence', () => {
    assert.deepEqual(ids(BOTH, { occurrence: { accountId: '000000000201', region: REGION } }), [
      '000000000201',
      '000000000202',
    ]);
  });

  it('reads only the occurrence account, or every account without an occurrence', () => {
    assert.deepEqual(ids(OF_OCCURRENCE, { occurrence: { accountId: '000000000102', region: REGION } }), [
      '000000000102',
    ]);
    assert.deepEqual(ids(OF_OCCURRENCE, { environment: 'uat' }), ['000000000201', '000000000202']);
  });

  it('rejects an occurrence in an account the selection does not read', () => {
    const occurrence = { accountId: '000000000101', region: REGION };
    assert.throws(
      () => selectAwsAccounts(port({ occurrence }), { ...OF_OCCURRENCE, accounts: [EXTRA] }),
      rejectsWith('AWS_OCCURRENCE_ACCOUNT_MISMATCH'),
    );
  });

  it('rejects an occurrence outside an every-account selection too', () => {
    assert.throws(
      () => selectAwsAccounts(port({ occurrence: { accountId: '000000000103', region: REGION } }), BOTH),
      rejectsWith('AWS_OCCURRENCE_ACCOUNT_MISMATCH'),
    );
  });

  it('enforces the allowed environments for an occurrence and for a local execution', () => {
    assert.deepEqual(ids(PROD_ONLY, { occurrence: { accountId: '000000000102', region: REGION } }), ['000000000102']);
    assert.throws(
      () => selectAwsAccounts(port({ occurrence: { accountId: '000000000202', region: REGION } }), PROD_ONLY),
      rejectsWith('AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED'),
    );
    assert.throws(
      () => selectAwsAccounts(port({ environment: 'uat' }), PROD_ONLY),
      rejectsWith('AWS_ACCOUNT_ENVIRONMENT_NOT_ALLOWED'),
    );
  });

  it('rejects two logical accounts that are the same physical account', () => {
    assert.throws(
      () =>
        selectAwsAccounts(port({ environment: 'dev' }), {
          subject: 'alias',
          accounts: [CORE, ALIAS],
          scope: 'every-account',
        }),
      rejectsWith('AWS_ACCOUNT_SELECTION_AMBIGUOUS'),
    );
  });

  it('reports a missing entry of an account the execution reads', () => {
    assert.throws(
      () => selectAwsAccounts(port({ environment: 'dev' }), BOTH),
      rejectsWith('AWS_ACCOUNT_NOT_CONFIGURED'),
    );
  });
});
