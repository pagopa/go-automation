import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSAccountProfileSet } from '../AWSAccountProfileSet.js';
import type { AWSClientProvider } from '../AWSClientProvider.js';
import type { AWSProfileSet } from '../AWSProfileSet.js';

class RecordingProfileSet implements AWSProfileSet {
  readonly requested: string[] = [];

  constructor(readonly profileNames: ReadonlyArray<string>) {}

  get first(): AWSClientProvider {
    // Safe: the constructor of the set under test guarantees a non-empty list.
    return this.getClientProvider(this.profileNames[0]!);
  }

  getClientProvider(profile: string): AWSClientProvider {
    this.requested.push(profile);
    // Safe: these tests only read the profile back out of the provider.
    return { getProfile: (): string => profile } as unknown as AWSClientProvider;
  }
}

describe('AWSAccountProfileSet', () => {
  it('exposes only the profiles it was narrowed to', () => {
    const source = new RecordingProfileSet(['sso_prod', 'sso_uat', 'sso_dev']);

    const scoped = new AWSAccountProfileSet(source, ['sso_uat']);

    assert.deepStrictEqual(scoped.profileNames, ['sso_uat']);
    assert.strictEqual(scoped.first.getProfile(), 'sso_uat');
  });

  it('borrows the client providers instead of building its own', () => {
    // Views share credentials and connections with the set they narrow, which is
    // also why none of them may close what it did not open.
    const source = new RecordingProfileSet(['sso_prod', 'sso_uat']);
    const scoped = new AWSAccountProfileSet(source, ['sso_uat']);

    scoped.getClientProvider('sso_uat');

    assert.deepStrictEqual(source.requested, ['sso_uat']);
  });

  it('refuses a profile outside the account it is scoped to', () => {
    const source = new RecordingProfileSet(['sso_prod', 'sso_uat']);
    const scoped = new AWSAccountProfileSet(source, ['sso_uat']);

    assert.throws(() => scoped.getClientProvider('sso_prod'), /outside the account-scoped profiles/u);
  });

  it('rejects an empty profile list', () => {
    const source = new RecordingProfileSet(['sso_prod']);

    assert.throws(() => new AWSAccountProfileSet(source, []), /at least one profile/u);
  });
});
