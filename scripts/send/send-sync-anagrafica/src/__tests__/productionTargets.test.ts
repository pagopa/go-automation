import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSProfileClients, AWSProfileSet } from '@pagopa/go-aws';
import { resolveProductionTargets } from '../libs/productionTargets.js';

/**
 * A profile set whose providers resolve to fixed accounts.
 *
 * @param accounts - Account id by profile; an Error stands for unreadable credentials
 */
function profileSet(accounts: Readonly<Record<string, string | Error>>): AWSProfileSet {
  const provider = (profile: string): AWSProfileClients =>
    ({
      resolveAccountId: async (): Promise<string> => {
        const account = await Promise.resolve(accounts[profile]);
        if (account === undefined || account instanceof Error) throw account ?? new Error('unknown');
        return account;
      },
    }) as unknown as AWSProfileClients;
  const names = Object.keys(accounts);

  return { profileNames: names, first: provider(names[0] ?? ''), getClientProvider: provider };
}

describe('resolveProductionTargets', () => {
  it('labels each profile and carries the account its credentials resolve to', async () => {
    const targets = await resolveProductionTargets(profileSet({ alias: '510769970275', dev: '111111111111' }), [
      'alias',
      'dev',
    ]);

    assert.deepEqual(targets, [
      { label: 'alias', profile: 'alias', accountId: '510769970275' },
      { label: 'dev', profile: 'dev', accountId: '111111111111' },
    ]);
  });

  it('treats a profile whose identity cannot be resolved as production', async () => {
    const targets = await resolveProductionTargets(profileSet({ 'sso_pn-core-prod': new Error('expired'), dev: '1' }), [
      'sso_pn-core-prod',
    ]);

    assert.deepEqual(targets, [
      { label: 'sso_pn-core-prod', profile: 'sso_pn-core-prod', isProduction: true, unresolved: true },
    ]);
  });
});

describe('resolveProductionTargets, configured markers', () => {
  const set = profileSet({ 'team-live': '2', 'send-test': '3' });

  it('lets a configured marker add production, case-insensitively', async () => {
    const targets = await resolveProductionTargets(set, ['team-live', 'send-test'], ['LIVE', '']);

    assert.deepEqual(targets, [
      { label: 'team-live', profile: 'team-live', accountId: '2', isProduction: true },
      { label: 'send-test', profile: 'send-test', accountId: '3' },
    ]);
  });

  it('describes only the profiles it is given', async () => {
    const targets = await resolveProductionTargets(set, ['send-test']);

    assert.deepEqual(
      targets.map((target) => target.label),
      ['send-test'],
    );
  });
});
