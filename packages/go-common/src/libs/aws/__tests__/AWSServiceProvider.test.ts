import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSAccountProfileSet } from '../AWSAccountProfileSet.js';
import type { AWSClientProvider } from '../AWSClientProvider.js';
import type { AWSProfileSet } from '../AWSProfileSet.js';
import { AWSServiceProvider } from '../AWSServiceProvider.js';

/** Records which profiles had a client taken from them. */
class FakeProfileSet implements AWSProfileSet {
  readonly clientsTakenFrom: string[] = [];

  constructor(readonly profileNames: ReadonlyArray<string>) {}

  get first(): AWSClientProvider {
    // Safe: every test builds the set with at least one profile.
    return this.getClientProvider(this.profileNames[0]!);
  }

  getClientProvider(profile: string): AWSClientProvider {
    this.clientsTakenFrom.push(profile);
    // Safe: the services under test only read the SDK client off the provider.
    return {
      getProfile: (): string => profile,
      getRegion: (): string => 'eu-south-1',
      cloudWatch: { tag: profile },
      dynamoDB: { tag: profile },
      athena: { tag: profile },
    } as unknown as AWSClientProvider;
  }
}

function clientTag(service: object, field: string): unknown {
  return (Reflect.get(service, field) as { readonly tag?: unknown }).tag;
}

describe('AWSServiceProvider — account scoping', () => {
  it('builds every service on the scoped account, never on the other profiles', () => {
    // The reported bug: metrics, DynamoDB and Athena stayed on the first
    // configured profile even when the logs had been pointed elsewhere.
    const configured = new FakeProfileSet(['sso_prod', 'sso_uat', 'sso_dev']);
    const services = new AWSServiceProvider(new AWSAccountProfileSet(configured, ['sso_uat']));

    assert.strictEqual(clientTag(services.cloudWatchMetrics, 'client'), 'sso_uat');
    assert.strictEqual(clientTag(services.dynamoDB, 'client'), 'sso_uat');
    assert.strictEqual(clientTag(services.athena, 'client'), 'sso_uat');
    // CloudWatch Logs takes its client per query, so what matters is the set it
    // was handed: only the scoped profile can ever be asked for one.
    assert.ok(services.cloudWatchLogs !== undefined);
    assert.deepStrictEqual(
      [...new Set(configured.clientsTakenFrom)],
      ['sso_uat'],
      'no client may be taken from a profile of another account',
    );
  });

  it('gives two accounts independent services and caches', () => {
    const configured = new FakeProfileSet(['sso_prod', 'sso_uat']);

    const uat = new AWSServiceProvider(new AWSAccountProfileSet(configured, ['sso_uat']));
    const prod = new AWSServiceProvider(new AWSAccountProfileSet(configured, ['sso_prod']));

    assert.strictEqual(clientTag(uat.dynamoDB, 'client'), 'sso_uat');
    assert.strictEqual(clientTag(prod.dynamoDB, 'client'), 'sso_prod');
    assert.notStrictEqual(uat.cloudWatchLogs, prod.cloudWatchLogs, 'the log group cache must not be shared');
  });

  it('reports the profiles it was narrowed to, so a caller can say what it read', () => {
    const configured = new FakeProfileSet(['sso_prod', 'sso_uat']);

    const scoped = new AWSServiceProvider(new AWSAccountProfileSet(configured, ['sso_uat']));

    assert.deepStrictEqual(scoped.profileNames, ['sso_uat']);
    assert.deepStrictEqual(new AWSServiceProvider(configured).profileNames, ['sso_prod', 'sso_uat']);
  });

  it('caches each service, so repeated access reuses one instance', () => {
    const configured = new FakeProfileSet(['sso_uat']);
    const services = new AWSServiceProvider(configured);

    assert.strictEqual(services.dynamoDB, services.dynamoDB);
    assert.strictEqual(services.cloudWatchLogs, services.cloudWatchLogs);
  });
});
