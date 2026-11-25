import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AWSActiveOperationRegistry, type AWSProfileClients, type AWSProfileSet } from '@pagopa/go-aws';
import type { AWSCloudWatchLogsQueryService, AWSCloudWatchLogsTarget } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { parseAwsAccountDirectory } from '@pagopa/go-aws/profiles';

import { isAwsAccountError } from '../../../toolkits/common/accounts/AwsAccountError.js';
import { parseAwsLogicalAccount } from '../../../toolkits/common/accounts/parseAwsLogicalAccount.js';
import { RuntimeAwsAccountsPort } from '../RuntimeAwsAccountsPort.js';
import type { RuntimeAwsAccountsPortOptions } from '../RuntimeAwsAccountsPortOptions.js';

const REGION = 'eu-south-1';
const CORE = parseAwsLogicalAccount('shop/core');
const EXTRA = parseAwsLogicalAccount('shop/extra');
const DIRECTORY = parseAwsAccountDirectory([
  'shop/core/prod=000000000101',
  'shop/extra/prod=000000000102',
  'shop/core/uat=000000000201',
  'shop/extra/uat=000000000202',
]);

/** What STS answers for a profile: an account and a permission set, or a failure. */
type IdentityScript = { readonly accountId: string; readonly permissionSet?: string; readonly region?: string } | Error;

function arnOf(accountId: string, permissionSet: string | undefined): string {
  return permissionSet === undefined
    ? `arn:aws:iam::${accountId}:user/someone`
    : `arn:aws:sts::${accountId}:assumed-role/AWSReservedSSO_${permissionSet}_0123456789abcdef/someone`;
}

/** Profile set whose identities are scripted; profile names are deliberately arbitrary. */
function profileSet(scripts: ReadonlyArray<readonly [string, IdentityScript]>): AWSProfileSet {
  const byName = new Map(scripts);
  const clients = (profile: string): AWSProfileClients => {
    const script = byName.get(profile);
    // Safe: the port only calls resolveIdentity on the profile clients.
    return {
      getRegion: () => (script === undefined || script instanceof Error ? REGION : (script.region ?? REGION)),
      resolveIdentity: async () => {
        await Promise.resolve();
        if (script === undefined || script instanceof Error) throw script ?? new Error('unknown profile');
        return { accountId: script.accountId, arn: arnOf(script.accountId, script.permissionSet) };
      },
    } as unknown as AWSProfileClients;
  };
  const [first] = scripts;
  return {
    profileNames: scripts.map(([name]) => name),
    first: clients(first?.[0] ?? ''),
    getClientProvider: clients,
  };
}

/** A reader the port built: the chosen profiles and the exact target. */
interface BuiltReader {
  readonly profiles: ReadonlyArray<string>;
  readonly target: AWSCloudWatchLogsTarget;
}

/** Records the exact reader the port builds instead of creating a real CloudWatch Logs service. */
class RecordingPort extends RuntimeAwsAccountsPort {
  readonly built: BuiltReader[] = [];

  protected override createExactReader(
    profiles: AWSProfileSet,
    target: AWSCloudWatchLogsTarget,
  ): AWSCloudWatchLogsQueryService {
    this.built.push({ profiles: profiles.profileNames, target });
    // Safe: the tests only inspect what was recorded.
    return {} as AWSCloudWatchLogsQueryService;
  }
}

function port(options: Partial<RuntimeAwsAccountsPortOptions>): RecordingPort {
  return new RecordingPort({
    directory: DIRECTORY,
    region: REGION,
    binding: 'profiles',
    environment: 'prod',
    ...options,
  });
}

describe('RuntimeAwsAccountsPort — profiles binding', () => {
  it('matches profiles by STS account, whatever their names, with an exact target and no fallback', async () => {
    const accounts = port({
      profiles: profileSet([
        ['my-laptop-extra', { accountId: '000000000102' }],
        ['whatever-core', { accountId: '000000000101' }],
      ]),
    });
    await accounts.prepare([CORE, EXTRA]);
    assert.deepEqual(accounts.built, [
      { profiles: ['whatever-core'], target: { accountId: '000000000101', region: REGION } },
      { profiles: ['my-laptop-extra'], target: { accountId: '000000000102', region: REGION } },
    ]);
  });

  it('prefers the configured permission sets, then configuration order', async () => {
    const profiles = profileSet([
      ['ops', { accountId: '000000000101', permissionSet: 'Operations' }],
      ['plain-user', { accountId: '000000000101' }],
      ['reader', { accountId: '000000000101', permissionSet: 'ReadOnlyAccess' }],
    ]);
    const preferring = port({ profiles, permissionSets: ['ReadOnlyAccess'] });
    await preferring.prepare([CORE]);
    assert.deepEqual(preferring.built[0]?.profiles, ['reader']);

    const unconfigured = port({ profiles });
    await unconfigured.prepare([CORE]);
    assert.deepEqual(unconfigured.built[0]?.profiles, ['ops']);

    // A preference nobody has is only a preference: any profile of the account still works.
    const unmatched = port({ profiles, permissionSets: ['Nobody'] });
    await unmatched.prepare([CORE]);
    assert.deepEqual(unmatched.built[0]?.profiles, ['ops']);
  });

  it('reports an unreachable account when every identity resolved and none is in the account', async () => {
    const accounts = port({ profiles: profileSet([['other', { accountId: '000000000999' }]]) });
    await assert.rejects(
      async () => accounts.prepare([CORE]),
      (error: unknown) => isAwsAccountError(error) && error.code === 'AWS_ACCOUNT_UNREACHABLE',
    );
  });

  it('keeps an unresolved identity a transient failure, not a configuration error', async () => {
    const accounts = port({
      profiles: profileSet([
        ['expired', new Error('ExpiredToken')],
        ['other', { accountId: '000000000999' }],
      ]),
    });
    await assert.rejects(
      async () => accounts.prepare([CORE]),
      (error: unknown) =>
        !isAwsAccountError(error) && error instanceof Error && /could not be resolved/u.test(error.message),
    );
  });

  it('rejects a profile of the account configured for another region, before any query', async () => {
    const accounts = port({ profiles: profileSet([['west', { accountId: '000000000101', region: 'eu-west-1' }]]) });
    await assert.rejects(
      async () => accounts.prepare([CORE]),
      (error: unknown) =>
        isAwsAccountError(error) && error.code === 'AWS_ACCOUNT_UNREACHABLE' && /region/u.test(error.message),
    );
    assert.deepEqual(accounts.built, []);
  });

  it('keeps profile names out of the propagated error and sends them to the local diagnostics', async () => {
    const diagnostics: string[] = [];
    const accounts = port({
      diagnostics: (message) => diagnostics.push(message),
      profiles: profileSet([
        ['secret-profile-name', new Error('Could not resolve credentials using profile: [secret-profile-name]')],
      ]),
    });
    await assert.rejects(
      async () => accounts.prepare([CORE]),
      (error: unknown) =>
        error instanceof Error && !isAwsAccountError(error) && !error.message.includes('secret-profile-name'),
    );
    assert.ok(diagnostics.some((message) => message.includes('secret-profile-name')));
  });

  it('reports the chosen profile only to the local diagnostics', async () => {
    const diagnostics: string[] = [];
    const accounts = port({
      diagnostics: (message) => diagnostics.push(message),
      profiles: profileSet([['local-core', { accountId: '000000000101' }]]),
    });
    await accounts.prepare([CORE]);
    assert.deepEqual(diagnostics, ['shop/core in prod: using profile local-core']);
  });

  it('reads the accounts of the occurrence environment once bound to an occurrence', () => {
    const accounts = port({
      profiles: profileSet([
        ['a', { accountId: '000000000201' }],
        ['b', { accountId: '000000000202' }],
      ]),
    }).bindToOccurrence({ accountId: '000000000201', region: REGION }, new AWSActiveOperationRegistry());
    assert.equal(accounts.environment(), 'uat');
    assert.deepEqual(accounts.resolve(EXTRA).accountId, '000000000202');
  });
});

/** The error the first query of `CORE` on a prepared port rejects with. */
async function queryError(accounts: RuntimeAwsAccountsPort): Promise<Error> {
  await accounts.prepare([CORE]);
  try {
    await accounts.cloudWatchLogsFor(CORE).query([], '', { start: new Date(0), end: new Date(0) });
  } catch (error: unknown) {
    assert.ok(error instanceof Error);
    return error;
  }
  return assert.fail('the query should have failed');
}

/** A forTarget call on the monitoring reader. */
interface MonitoringCall {
  readonly target: AWSCloudWatchLogsTarget;
  readonly activeOperations: unknown;
}

/** A failing go-aws reader error, with a code and a profile suffix. */
class FakeLogsError extends Error {
  override readonly name = 'FakeLogsError';
  readonly code = 'OAM_ACCESS_DENIED';
}

/** Port whose exact reader always fails with a go-aws style error naming the profile. */
class FailingReaderPort extends RuntimeAwsAccountsPort {
  protected override createExactReader(): AWSCloudWatchLogsQueryService {
    // Safe: only query is called in the test.
    return {
      query: async () => {
        await Promise.resolve();
        throw new FakeLogsError('CloudWatch Logs StartQuery access denied (profile: secret-reader)');
      },
    } as unknown as AWSCloudWatchLogsQueryService;
  }
}

describe('RuntimeAwsAccountsPort — query errors', () => {
  it('removes profile names from query errors, keeping prototype and code, and logs the original locally', async () => {
    const diagnostics: string[] = [];
    const accounts = new FailingReaderPort({
      directory: DIRECTORY,
      region: REGION,
      binding: 'profiles',
      environment: 'prod',
      diagnostics: (message) => diagnostics.push(message),
      profiles: profileSet([['secret-reader', { accountId: '000000000101' }]]),
    });
    const error = await queryError(accounts);
    assert.ok(error instanceof FakeLogsError);
    assert.strictEqual(error.code, 'OAM_ACCESS_DENIED');
    assert.doesNotMatch(`${error.message}${error.stack ?? ''}`, /secret-reader/u);
    assert.ok(diagnostics.some((message) => message.includes('(profile: secret-reader)')));
  });
});

/** A port whose oam reader fails with `error`, like `AWSCloudWatchLogsService.wrapAwsError` does. */
function failingOamPort(error: Error, profiles?: AWSProfileSet): RuntimeAwsAccountsPort {
  // Safe: only forTarget and query are used.
  const monitoring = {
    forTarget: () => monitoring,
    query: async () => {
      await Promise.resolve();
      throw error;
    },
  } as unknown as AWSCloudWatchLogsQueryService;
  return new RuntimeAwsAccountsPort({
    directory: DIRECTORY,
    region: REGION,
    binding: 'oam',
    environment: 'prod',
    monitoring,
    ...(profiles === undefined ? {} : { profiles }),
  });
}

/** An SDK provider failure as `@smithy/property-provider` builds it: the name is what identifies it. */
function providerError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

describe('RuntimeAwsAccountsPort — query errors of the oam binding', () => {
  it('removes the configured profiles from SDK credential errors, keeping the classification text', async () => {
    const credentials = await queryError(
      failingOamPort(
        new Error(
          'CloudWatch Logs StartQuery access denied: Could not resolve credentials using profile: [a] in configuration/credentials file(s). (profile: a)',
        ),
        profileSet([['a', { accountId: '000000000999' }]]),
      ),
    );
    assert.match(credentials.message, /access denied/u);
    assert.doesNotMatch(credentials.message, /\[a\]|profile: a\b/u);

    // Profiles named like the words that classify a failure do not erase them.
    const named = await queryError(
      failingOamPort(
        new Error('CloudWatch Logs StartQuery access denied (profile: access)'),
        profileSet([
          ['access', { accountId: '000000000999' }],
          ['denied', { accountId: '000000000998' }],
        ]),
      ),
    );
    assert.strictEqual(named.message, 'CloudWatch Logs StartQuery access denied');
  });

  it('replaces the text of every SDK credential provider failure', async () => {
    // The messages the installed @aws-sdk credential and token providers emit.
    const causes: ReadonlyArray<Error> = [
      providerError(
        'CredentialsProviderError',
        'Profile mfa-secret requires multi-factor authentication, but no MFA code callback was provided.',
      ),
      providerError(
        'CredentialsProviderError',
        'Unsupported credential source in profile source-secret. Got Foo, expected EcsContainer or Ec2InstanceMetadata or Environment.',
      ),
      providerError(
        'CredentialsProviderError',
        'Detected a cycle attempting to resolve credentials for profile cycle-secret. Profiles visited: cycle-secret, other-secret',
      ),
      providerError('ProviderError', 'TimeoutError from instance metadata service'),
      providerError(
        'TokenProviderError',
        'The SSO session token associated with profile=token-secret was not found or is invalid. To refresh this SSO session run aws sso login.',
      ),
    ];
    for (const cause of causes) {
      const error = await queryError(
        failingOamPort(
          new Error(`CloudWatch Logs StartQuery failed: ${cause.message} (profile: sso-secret)`, { cause }),
        ),
      );
      assert.strictEqual(
        error.message,
        `CloudWatch Logs StartQuery failed: [${cause.name}] AWS credentials could not be resolved`,
      );
      assert.doesNotMatch(error.stack ?? '', /secret/u);
      assert.strictEqual(error.cause, undefined);
    }
  });
});

describe('RuntimeAwsAccountsPort — oam binding', () => {
  it('targets the monitoring reader at exactly the account, with the occurrence operations', async () => {
    const calls: MonitoringCall[] = [];
    // Safe: the port only calls forTarget on the monitoring reader.
    const monitoring = {
      forTarget: (target: AWSCloudWatchLogsTarget, activeOperations?: AWSActiveOperationRegistry) => {
        calls.push({ target, activeOperations });
        return monitoring;
      },
    } as unknown as AWSCloudWatchLogsQueryService;
    const activeOperations = new AWSActiveOperationRegistry();
    const accounts = new RuntimeAwsAccountsPort({
      directory: DIRECTORY,
      region: REGION,
      binding: 'oam',
      monitoring,
    }).bindToOccurrence({ accountId: '000000000102', region: REGION }, activeOperations);
    await accounts.prepare([CORE]);
    assert.deepEqual(calls, [{ target: { accountId: '000000000101', region: REGION }, activeOperations }]);
  });

  it('requires the credentials of its binding', () => {
    assert.throws(
      () => new RuntimeAwsAccountsPort({ directory: DIRECTORY, region: REGION, binding: 'oam' }),
      /monitoring/u,
    );
    assert.throws(
      () => new RuntimeAwsAccountsPort({ directory: DIRECTORY, region: REGION, binding: 'profiles' }),
      /profiles/u,
    );
  });
});
