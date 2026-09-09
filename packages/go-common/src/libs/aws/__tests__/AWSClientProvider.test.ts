import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { STSClient } from '@aws-sdk/client-sts';

import { AWSClientProvider } from '../AWSClientProvider.js';

/** Counts the GetCallerIdentity calls a provider actually makes. */
interface ScriptedSts {
  readonly sends: ReadonlyArray<unknown>;
  send(command: unknown): Promise<{ readonly Account?: string }>;
}

function scriptedSts(outcomes: ReadonlyArray<string | Error | undefined>): ScriptedSts {
  const sends: unknown[] = [];
  const remaining = [...outcomes];
  return {
    sends,
    async send(command: unknown): Promise<{ readonly Account?: string }> {
      await Promise.resolve();
      sends.push(command);
      const next = remaining.shift();
      if (next instanceof Error) throw next;
      return next === undefined ? {} : { Account: next };
    },
  };
}

describe('AWSClientProvider — account identity', () => {
  it('shares one GetCallerIdentity across concurrent callers', async (t) => {
    // Every occurrence of a multi-account run asks its profiles for an identity:
    // without this, a hundred occurrences would mean a hundred STS calls.
    const sts = scriptedSts(['111111111111']);
    t.mock.getter(AWSClientProvider.prototype, 'sts', () => sts as unknown as STSClient);
    const provider = new AWSClientProvider({ profile: 'sso_prod', region: 'eu-south-1' });

    const resolved = await Promise.all([
      provider.resolveAccountId(),
      provider.resolveAccountId(),
      provider.resolveAccountId(),
    ]);

    assert.deepStrictEqual(resolved, ['111111111111', '111111111111', '111111111111']);
    assert.strictEqual(sts.sends.length, 1, 'the in-flight lookup must be shared, not repeated');
  });

  it('reuses the resolved account id on later calls', async (t) => {
    const sts = scriptedSts(['111111111111']);
    t.mock.getter(AWSClientProvider.prototype, 'sts', () => sts as unknown as STSClient);
    const provider = new AWSClientProvider({ profile: 'sso_prod', region: 'eu-south-1' });

    await provider.resolveAccountId();
    await provider.resolveAccountId();

    assert.strictEqual(sts.sends.length, 1);
  });

  it('drops a failed lookup, so a renewed SSO session can recover', async (t) => {
    const sts = scriptedSts([new Error('ExpiredToken'), '222222222222']);
    t.mock.getter(AWSClientProvider.prototype, 'sts', () => sts as unknown as STSClient);
    const provider = new AWSClientProvider({ profile: 'sso_uat', region: 'eu-south-1' });

    await assert.rejects(async () => provider.resolveAccountId(), /ExpiredToken/u);

    assert.strictEqual(await provider.resolveAccountId(), '222222222222');
    assert.strictEqual(sts.sends.length, 2);
  });

  it('rejects an identity that carries no account id, naming the profile', async (t) => {
    const sts = scriptedSts([undefined]);
    t.mock.getter(AWSClientProvider.prototype, 'sts', () => sts as unknown as STSClient);
    const provider = new AWSClientProvider({ profile: 'sso_uat', region: 'eu-south-1' });

    await assert.rejects(async () => provider.resolveAccountId(), /sso_uat/u);
  });
});
