import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSClientProvider } from '../AWSClientProvider.js';
import { AWSMultiClientProvider } from '../AWSMultiClientProvider.js';
import { isAWSTargetNotConfiguredError } from '../AWSTargetNotConfiguredError.js';

const REGION = 'eu-south-1';

/** What a profile's `sts:GetCallerIdentity` answers on each successive call. */
type IdentityScript = ReadonlyArray<string | Error>;

/**
 * Provider whose profiles resolve to scripted identities instead of calling STS.
 *
 * Overrides the one seam every account lookup goes through, so the scoping
 * rules can be tested without credentials.
 */
class ScriptedMultiClientProvider extends AWSMultiClientProvider {
  readonly identityCalls: string[] = [];
  private readonly fakes = new Map<string, AWSClientProvider>();

  constructor(
    private readonly identities: ReadonlyMap<string, IdentityScript>,
    profiles: ReadonlyArray<string>,
  ) {
    super({ profiles, region: REGION });
  }

  override getClientProvider(profile: string): AWSClientProvider {
    const cached = this.fakes.get(profile);
    if (cached !== undefined) return cached;

    const script = [...(this.identities.get(profile) ?? [])];
    let resolved: string | undefined;
    const fake = {
      getProfile: (): string => profile,
      getRegion: (): string => REGION,
      resolveAccountId: async (): Promise<string> => {
        await Promise.resolve();
        if (resolved !== undefined) return resolved;
        this.identityCalls.push(profile);
        const next = script.shift();
        if (next === undefined) throw new Error(`No scripted identity left for '${profile}'`);
        if (next instanceof Error) throw next;
        resolved = next;
        return next;
      },
      // Safe: the tests only exercise identity resolution and profile selection.
    } as unknown as AWSClientProvider;
    this.fakes.set(profile, fake);

    return fake;
  }
}

function scripted(entries: ReadonlyArray<readonly [string, IdentityScript]>): ReadonlyMap<string, IdentityScript> {
  return new Map(entries);
}

describe('AWSMultiClientProvider — profileSetFor', () => {
  it('narrows to the profile owning the account, not to the first configured one', async () => {
    // The reported bug: log group names repeat across environments, so the prod
    // profile answered uat queries successfully and with no rows.
    const provider = new ScriptedMultiClientProvider(
      scripted([
        ['sso_prod', ['111111111111']],
        ['sso_uat', ['222222222222']],
      ]),
      ['sso_prod', 'sso_uat'],
    );

    const scoped = await provider.profileSetFor({ accountId: '222222222222', region: REGION });

    assert.deepStrictEqual(scoped.profileNames, ['sso_uat']);
    assert.strictEqual(scoped.first.getProfile(), 'sso_uat');
  });

  it('keeps every profile of the account, so log group discovery still has candidates', async () => {
    const provider = new ScriptedMultiClientProvider(
      scripted([
        ['sso_uat_reader', ['222222222222']],
        ['sso_prod', ['111111111111']],
        ['sso_uat_admin', ['222222222222']],
      ]),
      ['sso_uat_reader', 'sso_prod', 'sso_uat_admin'],
    );

    const scoped = await provider.profileSetFor({ accountId: '222222222222', region: REGION });

    assert.deepStrictEqual(scoped.profileNames, ['sso_uat_reader', 'sso_uat_admin']);
  });

  it('fails with a typed error when no profile owns the account', async () => {
    const provider = new ScriptedMultiClientProvider(scripted([['sso_prod', ['111111111111']]]), ['sso_prod']);

    const error = await provider
      .profileSetFor({ accountId: '222222222222', region: REGION })
      .then(() => undefined)
      .catch((caught: unknown) => caught);

    assert.ok(isAWSTargetNotConfiguredError(error));
    assert.strictEqual(error.code, 'AWS_ACCOUNT_NOT_CONFIGURED');
    assert.match(error.message, /222222222222/u);
  });

  it('fails on a single misconfigured profile instead of querying it anyway', async () => {
    // A lone profile used to be treated as "nothing to choose", which returned
    // the wrong account's empty results in silence.
    const provider = new ScriptedMultiClientProvider(scripted([['sso_prod', ['111111111111']]]), ['sso_prod']);

    await assert.rejects(
      async () => provider.profileSetFor({ accountId: '222222222222', region: REGION }),
      /No configured AWS profile resolves to account/u,
    );
  });

  it('rejects a target in another region rather than reading the configured one', async () => {
    const provider = new ScriptedMultiClientProvider(scripted([['sso_prod', ['111111111111']]]), ['sso_prod']);

    const error = await provider
      .profileSetFor({ accountId: '111111111111', region: 'eu-west-1' })
      .then(() => undefined)
      .catch((caught: unknown) => caught);

    assert.ok(isAWSTargetNotConfiguredError(error));
    assert.strictEqual(error.code, 'AWS_REGION_NOT_CONFIGURED');
  });

  it('rejects a target with no account id', async () => {
    const provider = new ScriptedMultiClientProvider(scripted([['sso_prod', ['111111111111']]]), ['sso_prod']);

    await assert.rejects(
      async () => provider.profileSetFor({ accountId: '   ', region: REGION }),
      /carries no AWS account id/u,
    );
  });

  it('keeps its own identity when every profile owns the account', async () => {
    const provider = new ScriptedMultiClientProvider(scripted([['sso_uat', ['222222222222']]]), ['sso_uat']);

    const scoped = await provider.profileSetFor({ accountId: '222222222222', region: REGION });

    assert.strictEqual(scoped, provider, 'nothing was narrowed, so there is no view to build');
  });
});

describe('AWSMultiClientProvider — identity resolution', () => {
  it('recovers a profile whose credentials were refreshed after a failure', async () => {
    // The failed lookup must not be cached: an SSO token that expires mid-run
    // and is renewed has to become usable again.
    const provider = new ScriptedMultiClientProvider(
      scripted([['sso_uat', [new Error('ExpiredToken'), '222222222222']]]),
      ['sso_uat'],
    );

    await assert.rejects(async () => provider.profileSetFor({ accountId: '222222222222', region: REGION }));

    const scoped = await provider.profileSetFor({ accountId: '222222222222', region: REGION });
    assert.deepStrictEqual(scoped.profileNames, ['sso_uat']);
  });

  it('asks each profile for its identity only once', async () => {
    const provider = new ScriptedMultiClientProvider(
      scripted([
        ['sso_prod', ['111111111111']],
        ['sso_uat', ['222222222222']],
      ]),
      ['sso_prod', 'sso_uat'],
    );

    await Promise.all([
      provider.profileSetFor({ accountId: '222222222222', region: REGION }),
      provider.profileSetFor({ accountId: '111111111111', region: REGION }),
      provider.profileSetFor({ accountId: '222222222222', region: REGION }),
    ]);

    assert.deepStrictEqual([...provider.identityCalls].sort(), ['sso_prod', 'sso_uat']);
  });

  it('does not blame the configuration when an identity could not be checked', async () => {
    // The profile with the expired session may well be the right one: saying
    // "no profile resolves to that account" would be a guess, and would hide
    // the ExpiredToken that actually needs fixing.
    const provider = new ScriptedMultiClientProvider(
      scripted([
        ['sso_prod', ['111111111111']],
        ['sso_uat', [new Error('ExpiredToken: the SSO session has expired')]],
      ]),
      ['sso_prod', 'sso_uat'],
    );

    const error = await provider
      .profileSetFor({ accountId: '222222222222', region: REGION })
      .then(() => undefined)
      .catch((caught: unknown) => caught);

    assert.ok(isAWSTargetNotConfiguredError(error));
    assert.strictEqual(error.code, 'AWS_PROFILE_IDENTITY_UNAVAILABLE');
    assert.match(error.message, /sso_uat: ExpiredToken/u);
  });

  it('proceeds when a profile matches, even if another could not be resolved', async () => {
    const provider = new ScriptedMultiClientProvider(
      scripted([
        ['sso_broken', [new Error('ExpiredToken')]],
        ['sso_uat', ['222222222222']],
      ]),
      ['sso_broken', 'sso_uat'],
    );

    const scoped = await provider.profileSetFor({ accountId: '222222222222', region: REGION });

    assert.deepStrictEqual(scoped.profileNames, ['sso_uat']);
  });
});
