import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { TestContext } from 'node:test';

import { AWSClientProvider } from '../AWSClientProvider.js';
import { AWSClientsProvider } from '../AWSClientsProvider.js';
import { AWSCloudWatchLogsService } from '../../cloudwatch-logs/AWSCloudWatchLogsService.js';
import { AWSMultiClientProvider } from '../AWSMultiClientProvider.js';
import { AWSProvider } from '../AWSProvider.js';
import { isAWSTargetNotConfiguredError } from '../../AWSTargetNotConfiguredError.js';

/** Client getters that AWSClientsProvider serves from its first profile. */
const FIRST_PROFILE_GETTERS = [
  's3',
  'dynamoDB',
  'cloudWatch',
  'cloudWatchLogs',
  'athena',
  'sqs',
  'ecs',
  'lambda',
] as const;

/** Operation run once per profile. */
type ProfileOperationHandler<T> = (profile: string, clientProvider: AWSClientProvider) => Promise<T>;

/** Multi-profile provider whose profiles carry tagged placeholder clients. */
class FakeAWSMultiClientProvider {
  private readonly providers: Map<string, AWSClientProvider>;

  constructor(readonly profileNames: ReadonlyArray<string>) {
    this.providers = new Map(
      profileNames.map((profile) => [
        profile,
        // Safe: the aggregate only reads the client getters and the profile name.
        {
          getProfile: () => profile,
          ...Object.fromEntries(FIRST_PROFILE_GETTERS.map((getter) => [getter, { profile, getter }])),
        } as unknown as AWSClientProvider,
      ]),
    );
  }

  get size(): number {
    return this.providers.size;
  }

  get hasMultipleProfiles(): boolean {
    return this.providers.size > 1;
  }

  get first(): AWSClientProvider {
    return this.getClientProvider(this.profileNames[0] ?? '');
  }

  getClientProvider(profile: string): AWSClientProvider {
    const provider = this.providers.get(profile);
    if (provider === undefined) throw new Error(`Unknown profile: ${profile}`);
    return provider;
  }

  async mapParallel<T>(operation: ProfileOperationHandler<T>): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    for (const profile of this.profileNames) {
      results.set(profile, await operation(profile, this.getClientProvider(profile)));
    }
    return results;
  }
}

describe('AWS unified provider facade', () => {
  it('deduplicates profiles and exposes cached concrete providers', () => {
    const multi = new AWSMultiClientProvider({ profiles: ['dev', 'prod', 'dev'], region: 'eu-west-1' });

    assert.deepStrictEqual(multi.profileNames, ['dev', 'prod']);
    assert.strictEqual(multi.size, 2);
    assert.strictEqual(multi.hasMultipleProfiles, true);
    assert.strictEqual(multi.first.getProfile(), 'dev');
    assert.strictEqual(multi.first.getRegion(), 'eu-west-1');
    assert.strictEqual(multi.getClientProvider('prod'), multi.getClientProvider('prod'));
    assert.throws(() => multi.getClientProvider('test'), /Profile 'test' is not in the configured profiles/);

    const beforeClose = multi.getClientProvider('prod');
    multi.close();

    assert.notStrictEqual(multi.getClientProvider('prod'), beforeClose);
    multi.close();
  });

  it('uses the SDK default credential chain when no profile is configured', () => {
    const multi = new AWSMultiClientProvider({ profiles: [], region: 'eu-west-1' });

    assert.deepStrictEqual(multi.profileNames, ['default']);
    assert.strictEqual(multi.size, 1);
    assert.strictEqual(multi.hasMultipleProfiles, false);
    assert.strictEqual(multi.first.getProfile(), 'default');
  });

  it('maps operations across profiles, collecting errors when settled', async () => {
    const multi = new AWSMultiClientProvider({ profiles: ['dev', 'prod'] });

    const results = await multi.mapParallel(async (profile, clientProvider) =>
      Promise.resolve(`${profile}:${clientProvider.getProfile()}`),
    );
    const settled = await multi.mapParallelSettled(async (profile, clientProvider) => {
      await Promise.resolve();
      if (profile === 'prod') throw new Error('prod failed');
      return clientProvider.getProfile();
    });

    assert.deepStrictEqual(
      [...results.entries()],
      [
        ['dev', 'dev:dev'],
        ['prod', 'prod:prod'],
      ],
    );
    assert.deepStrictEqual([...settled.results.entries()], [['dev', 'dev']]);
    assert.deepStrictEqual(
      [...settled.errors.entries()].map(([profile, error]) => [profile, error.message]),
      [['prod', 'prod failed']],
    );
  });

  it('exposes first-profile client convenience getters and multi-profile helpers', async () => {
    const multi = new FakeAWSMultiClientProvider(['dev', 'prod']);
    // Safe: the aggregate only uses the members the fake implements.
    const clients = new AWSClientsProvider(multi as unknown as AWSMultiClientProvider);

    assert.deepStrictEqual(clients.profileNames, ['dev', 'prod']);
    assert.strictEqual(clients.size, 2);
    assert.strictEqual(clients.hasMultipleProfiles, true);
    for (const getter of FIRST_PROFILE_GETTERS) {
      assert.deepStrictEqual(clients[getter], { profile: 'dev', getter }, getter);
    }
    assert.strictEqual(clients.get('prod'), clients.getClientProvider('prod'));
    assert.strictEqual(clients.get('prod').getProfile(), 'prod');

    const results = await clients.mapParallel(async (profile) => Promise.resolve(profile.toUpperCase()));
    assert.deepStrictEqual(
      [...results.entries()],
      [
        ['dev', 'DEV'],
        ['prod', 'PROD'],
      ],
    );
  });

  it('creates clients and services lazily from provider config', () => {
    const provider = new AWSProvider({ profiles: ['dev'] });
    const clients = provider.clients;
    const services = provider.services;

    assert.deepStrictEqual(clients.profileNames, ['dev']);
    assert.strictEqual(provider.clients, clients);
    assert.strictEqual(provider.services, services);
    assert.ok(services.cloudWatchLogs instanceof AWSCloudWatchLogsService);

    provider.close();

    assert.notStrictEqual(provider.clients, clients);
    assert.notStrictEqual(provider.services, services);
  });
});

const TARGET_REGION = 'eu-south-1';
const UAT_ACCOUNT = '222222222222';
const PROD_ACCOUNT = '111111111111';

/**
 * Replaces the one STS lookup every account selection goes through.
 *
 * The map is read on each call, so a test can let an expired session recover by
 * rewriting the entry between two attempts.
 *
 * @param t - The running test, which restores the stub when it ends
 * @param identities - Profile to account id, or to the error it fails with
 * @returns The profiles asked for an identity, in call order
 */
function stubIdentities(t: TestContext, identities: ReadonlyMap<string, string | Error>): { readonly calls: string[] } {
  const calls: string[] = [];
  t.mock.method(AWSClientProvider.prototype, 'resolveAccountId', async function (this: AWSClientProvider) {
    await Promise.resolve();
    const profile = this.getProfile();
    calls.push(profile);
    const outcome = identities.get(profile);
    if (outcome === undefined) throw new Error(`No scripted identity for '${profile}'`);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { calls };
}

describe('AWSProvider — services bound to one execution target', () => {
  it('binds the services to the profile owning the account, not to the first configured one', async (t) => {
    stubIdentities(
      t,
      new Map([
        ['sso_prod', PROD_ACCOUNT],
        ['sso_uat', UAT_ACCOUNT],
      ]),
    );
    const provider = new AWSProvider({ profiles: ['sso_prod', 'sso_uat'], region: TARGET_REGION });

    const services = await provider.servicesFor({ accountId: UAT_ACCOUNT, region: TARGET_REGION });

    assert.deepStrictEqual(services.profileNames, ['sso_uat']);
    provider.close();
  });

  it('memoises the services per target, so concurrent occurrences share one identity lookup', async (t) => {
    const { calls } = stubIdentities(
      t,
      new Map([
        ['sso_prod', PROD_ACCOUNT],
        ['sso_uat', UAT_ACCOUNT],
      ]),
    );
    const provider = new AWSProvider({ profiles: ['sso_prod', 'sso_uat'], region: TARGET_REGION });
    const target = { accountId: UAT_ACCOUNT, region: TARGET_REGION };

    const [first, second] = await Promise.all([provider.servicesFor(target), provider.servicesFor(target)]);
    const third = await provider.servicesFor(target);

    assert.strictEqual(first, second, 'concurrent callers must share the pending resolution');
    assert.strictEqual(first, third, 'a settled resolution must be reused, keeping the log group cache warm');
    assert.deepStrictEqual([...calls].sort(), ['sso_prod', 'sso_uat'], 'each profile is asked once');
    provider.close();
  });

  it('gives two accounts independent services', async (t) => {
    stubIdentities(
      t,
      new Map([
        ['sso_prod', PROD_ACCOUNT],
        ['sso_uat', UAT_ACCOUNT],
      ]),
    );
    const provider = new AWSProvider({ profiles: ['sso_prod', 'sso_uat'], region: TARGET_REGION });

    const uat = await provider.servicesFor({ accountId: UAT_ACCOUNT, region: TARGET_REGION });
    const prod = await provider.servicesFor({ accountId: PROD_ACCOUNT, region: TARGET_REGION });

    assert.notStrictEqual(uat, prod);
    assert.deepStrictEqual(uat.profileNames, ['sso_uat']);
    assert.deepStrictEqual(prod.profileNames, ['sso_prod']);
    provider.close();
  });

  it('never caches a failed resolution, so refreshed credentials recover', async (t) => {
    const identities = new Map<string, string | Error>([['sso_uat', new Error('ExpiredToken')]]);
    stubIdentities(t, identities);
    const provider = new AWSProvider({ profiles: ['sso_uat'], region: TARGET_REGION });
    const target = { accountId: UAT_ACCOUNT, region: TARGET_REGION };

    await assert.rejects(async () => provider.servicesFor(target));
    identities.set('sso_uat', UAT_ACCOUNT);

    const services = await provider.servicesFor(target);
    assert.deepStrictEqual(services.profileNames, ['sso_uat']);
    provider.close();
  });

  it('keeps the run-wide services when every profile owns the account', async (t) => {
    stubIdentities(t, new Map([['sso_uat', UAT_ACCOUNT]]));
    const provider = new AWSProvider({ profiles: ['sso_uat'], region: TARGET_REGION });

    const services = await provider.servicesFor({ accountId: UAT_ACCOUNT, region: TARGET_REGION });

    assert.strictEqual(services, provider.services, 'nothing was narrowed, so there is nothing to rebuild');
    provider.close();
  });

  it('propagates the typed configuration error instead of serving the wrong account', async (t) => {
    stubIdentities(t, new Map([['sso_prod', PROD_ACCOUNT]]));
    const provider = new AWSProvider({ profiles: ['sso_prod'], region: TARGET_REGION });

    const error = await provider
      .servicesFor({ accountId: UAT_ACCOUNT, region: TARGET_REGION })
      .then(() => undefined)
      .catch((caught: unknown) => caught);

    assert.ok(isAWSTargetNotConfiguredError(error));
    assert.strictEqual(error.code, 'AWS_ACCOUNT_NOT_CONFIGURED');
    provider.close();
  });
});
