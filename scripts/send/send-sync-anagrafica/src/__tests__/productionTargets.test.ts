import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSProfileClients, AWSProfileSet } from '@pagopa/go-aws';
import {
  findProductionProfiles,
  findProductionProfileVerdicts,
  formatProductionProfiles,
  resolveProductionTargets,
} from '../libs/productionTargets.js';

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
    const targets = await resolveProductionTargets(profileSet({ alias: '510769970275', dev: '111111111111' }));

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

describe('findProductionProfiles', () => {
  it('fails closed on a profile whose account cannot be resolved, whatever its name', async () => {
    const set = profileSet({ 'unnamed-alias': new Error('expired'), 'send-test': '3' });

    assert.deepEqual(await findProductionProfiles(set, []), ['unnamed-alias']);
  });

  const set = profileSet({ 'send-core-prod': '1', alias: '697818730278', 'team-live': '2', 'send-test': '3' });

  it('keeps the baseline even when the configured markers are emptied', async () => {
    assert.deepEqual(await findProductionProfiles(set, []), ['send-core-prod', 'alias']);
  });

  it('lets configured markers add to the baseline, case-insensitively', async () => {
    assert.deepEqual(await findProductionProfiles(set, ['LIVE', '']), ['send-core-prod', 'alias', 'team-live']);
  });

  it('checks only the profiles it is given', async () => {
    assert.deepEqual(await findProductionProfiles(set, ['live'], ['send-test', 'team-live']), ['team-live']);
  });
});

describe('findProductionProfileVerdicts', () => {
  it('says unresolved only when the account failed and no other signal says production', async () => {
    const set = profileSet({
      'sso_pn-core-prod': new Error('expired'),
      'team-alias': new Error('expired'),
      alias: '697818730278',
      'send-test': '3',
    });

    assert.deepEqual(await findProductionProfileVerdicts(set, []), [
      { profile: 'sso_pn-core-prod', unresolved: false },
      { profile: 'team-alias', unresolved: true },
      { profile: 'alias', unresolved: false },
    ]);
  });

  it('counts a configured marker as production even when the account failed', async () => {
    const set = profileSet({ 'team-live': new Error('expired') });

    assert.deepEqual(await findProductionProfileVerdicts(set, ['live']), [{ profile: 'team-live', unresolved: false }]);
  });

  it('marks the resolved target of an unresolvable profile so a prompt can say why', async () => {
    const [target] = await resolveProductionTargets(profileSet({ 'team-alias': new Error('expired') }));

    assert.equal(target?.unresolved, true);
  });
});

describe('formatProductionProfiles', () => {
  it('words production and an unresolved account apart', () => {
    const text = formatProductionProfiles([
      { profile: 'a', unresolved: false },
      { profile: 'b', unresolved: true },
    ]);

    assert.match(text, /these profiles are production: a/);
    assert.match(text, /the account of b could not be resolved \(expired SSO session or no access\)/);
  });

  it('does not call an unresolved profile production', () => {
    assert.doesNotMatch(formatProductionProfiles([{ profile: 'b', unresolved: true }]), /are production/);
  });
});
