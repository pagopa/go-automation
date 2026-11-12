import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { STSClient } from '@aws-sdk/client-sts';

import type { AWSClientBaseConfig } from '../AWSClientBaseConfig.js';
import type { AWSClientFactory } from '../AWSClientFactory.js';
import { AWSProfileClientCache } from '../AWSProfileClientCache.js';
import { STS_CLIENT } from '../STS_CLIENT.js';

/** Counts the GetCallerIdentity calls a cache actually makes. */
interface ScriptedSts {
  readonly sends: ReadonlyArray<unknown>;
  send(command: unknown): Promise<{ readonly Account?: string }>;
  destroy(): void;
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
    destroy(): void {
      /* no resources */
    },
  };
}

interface FakeClient {
  readonly config: AWSClientBaseConfig;
  destroyed: boolean;
  destroy(): void;
}

function fakeFactory(key: string, created: FakeClient[]): AWSClientFactory<FakeClient> {
  return {
    key,
    create: (config) => {
      const client: FakeClient = {
        config,
        destroyed: false,
        destroy() {
          this.destroyed = true;
        },
      };
      created.push(client);
      return client;
    },
  };
}

describe('AWSProfileClientCache — clients', () => {
  it('creates each client kind once, with the region of the cache', () => {
    const created: FakeClient[] = [];
    const s3Like = fakeFactory('fake-s3', created);
    const sqsLike = fakeFactory('fake-sqs', created);
    const cache = new AWSProfileClientCache({ region: 'eu-central-1' });

    const first = cache.client(s3Like);
    assert.strictEqual(cache.client(s3Like), first, 'the client is cached per factory key');
    assert.notStrictEqual(cache.client(sqsLike), first, 'different keys get different clients');
    assert.strictEqual(created.length, 2);
    assert.strictEqual(first.config.region, 'eu-central-1');
    assert.strictEqual(first.config.credentials, undefined, 'no profile: default credential chain');
  });

  it('passes a profile credential provider when a profile is configured', () => {
    const created: FakeClient[] = [];
    const cache = new AWSProfileClientCache({ profile: '  sso_prod  ', region: 'eu-south-1' });

    const client = cache.client(fakeFactory('fake', created));

    assert.strictEqual(typeof client.config.credentials, 'function');
    assert.strictEqual(cache.getProfile(), 'sso_prod');
    assert.strictEqual(cache.getRegion(), 'eu-south-1');
  });

  it('reports the default profile and region when none are configured', () => {
    const cache = new AWSProfileClientCache({});

    assert.strictEqual(cache.getProfile(), 'default');
    assert.strictEqual(cache.getRegion(), 'eu-south-1');
  });

  it('destroys every created client on close and recreates them afterwards', () => {
    const created: FakeClient[] = [];
    const factory = fakeFactory('fake', created);
    const cache = new AWSProfileClientCache({ region: 'eu-south-1' });

    const first = cache.client(factory);
    cache.close();

    assert.strictEqual(first.destroyed, true);
    assert.notStrictEqual(cache.client(factory), first, 'close() drops the cached client');
  });
});

describe('AWSProfileClientCache — account identity', () => {
  it('shares one GetCallerIdentity across concurrent callers', async (t) => {
    const sts = scriptedSts(['111111111111']);
    t.mock.method(STS_CLIENT, 'create', () => sts as unknown as STSClient);
    const cache = new AWSProfileClientCache({ profile: 'sso_prod', region: 'eu-south-1' });

    const resolved = await Promise.all([cache.resolveAccountId(), cache.resolveAccountId(), cache.resolveAccountId()]);

    assert.deepStrictEqual(resolved, ['111111111111', '111111111111', '111111111111']);
    assert.strictEqual(sts.sends.length, 1, 'the in-flight lookup must be shared, not repeated');
  });

  it('reuses the resolved account id on later calls', async (t) => {
    const sts = scriptedSts(['111111111111']);
    t.mock.method(STS_CLIENT, 'create', () => sts as unknown as STSClient);
    const cache = new AWSProfileClientCache({ profile: 'sso_prod', region: 'eu-south-1' });

    await cache.resolveAccountId();
    await cache.resolveAccountId();

    assert.strictEqual(sts.sends.length, 1);
  });

  it('drops a failed lookup, so a renewed SSO session can recover', async (t) => {
    const sts = scriptedSts([new Error('ExpiredToken'), '222222222222']);
    t.mock.method(STS_CLIENT, 'create', () => sts as unknown as STSClient);
    const cache = new AWSProfileClientCache({ profile: 'sso_uat', region: 'eu-south-1' });

    await assert.rejects(async () => cache.resolveAccountId(), /ExpiredToken/u);

    assert.strictEqual(await cache.resolveAccountId(), '222222222222');
    assert.strictEqual(sts.sends.length, 2);
  });

  it('rejects an identity that carries no account id, naming the profile', async (t) => {
    const sts = scriptedSts([undefined]);
    t.mock.method(STS_CLIENT, 'create', () => sts as unknown as STSClient);
    const cache = new AWSProfileClientCache({ profile: 'sso_uat', region: 'eu-south-1' });

    await assert.rejects(async () => cache.resolveAccountId(), /sso_uat/u);
  });
});
