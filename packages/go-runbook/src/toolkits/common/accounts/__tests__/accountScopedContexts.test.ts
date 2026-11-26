import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CORE, EXTRA, port } from './fixtures.js';
import { accountScopedContexts } from '../accountScopedContexts.js';
import { createTestServiceRegistry } from '../../testing/createTestServiceRegistry.js';
import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';

describe('accountScopedContexts', () => {
  it('resolves every account of the selection with a context reading its logs', async () => {
    const readers = {
      [CORE]: createTestServiceRegistry().cloudWatchLogs,
      [EXTRA]: createTestServiceRegistry().cloudWatchLogs,
    };
    const awsAccounts = port({ environment: 'prod', readers });
    await awsAccounts.prepare([CORE, EXTRA]);
    const context = createTestContext({ services: { awsAccounts } });

    const accounts = accountScopedContexts(context, {
      subject: 'job',
      accounts: [CORE, EXTRA],
      scope: 'every-account',
    });

    assert.deepStrictEqual(
      accounts.map(({ name, account }) => [name, account.accountId]),
      [
        ['core', '000000000101'],
        ['extra', '000000000102'],
      ],
    );
    assert.strictEqual(accounts[0]?.context.services.cloudWatchLogs, readers[CORE]);
    assert.strictEqual(accounts[1]?.context.services.cloudWatchLogs, readers[EXTRA]);
    assert.strictEqual(accounts[0]?.context.params, context.params);
  });

  it('fails without an account port', () => {
    assert.throws(
      () => accountScopedContexts(createTestContext(), { subject: 'job', accounts: [CORE], scope: 'every-account' }),
      /account port is required/u,
    );
  });
});
