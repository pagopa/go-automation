import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type AWSExecutionTarget, AWSTargetNotConfiguredError } from '@pagopa/go-aws';
import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { GOLogger } from '@pagopa/go-common/logging';
import { createTestServiceRegistry, InMemoryAwsAccountsPort } from '@pagopa/go-runbook/toolkits/common';
import { parseAwsAccountDirectory } from '@pagopa/go-aws/profiles';
import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { RuntimeAwsAccountsPort } from '@pagopa/go-runbook/runtime';
import type {
  ResolvedServiceRegistry,
  ServiceRegistry,
  ServiceRegistryResolverFn,
} from '@pagopa/go-runbook/toolkits/common';
import type { AlarmEventDto } from '@go-automation/go-watchtower-client';

import { checkOccurrence } from '../checkOccurrence.js';
import type { RunbookCheckContext } from '../checkOccurrence.js';
import { resolveRunbookCacheDescriptor } from '../../cache/runbookFingerprint.js';
import type { RunbookCheckCache } from '../../cache/RunbookCheckCache.js';
import type { AnalysisMatch } from '../../types/RtaCheckReport.js';

/** An alarm with a registered runbook, so execution reaches the AWS binding. */
const ALARM_NAME = 'pn-delivery-B2B-ApiGwAlarm';

const UAT_ACCOUNT = '222222222222';
const PROD_ACCOUNT = '111111111111';

const OCCURRENCE = {
  id: '0192c000-0000-7000-8000-0000000000a1',
  firedAt: '2026-08-01T10:00:00.000Z',
  awsAccountId: UAT_ACCOUNT,
  awsRegion: 'eu-south-1',
  analysisId: null,
} as unknown as AlarmEventDto;

const NO_MATCH: AnalysisMatch = {
  status: 'NOT_LINKED',
  confidence: 0,
  reasons: [],
  signals: {
    knownErrorCodeMentioned: false,
    descriptionOverlap: 0,
    traceIdOverlap: [],
    downstreamOverlap: [],
    errorKeywordOverlap: [],
  },
};

/**
 * Builds a check context around `overrides`. The occurrence carries no analysis
 * id, so the Watchtower client is never reached and is left out.
 */
function checkContext(overrides: Record<string, unknown>): RunbookCheckContext {
  return {
    engineLogger: new GOLogger(),
    alarmName: ALARM_NAME,
    awsProfiles: ['sso_prod'],
    runbook: undefined,
    force: true,
    analysisCache: new Map(),
    analysisMatcher: async (): Promise<AnalysisMatch> => Promise.resolve(NO_MATCH),
    matchOptions: { includeIgnorable: false, includeIncomplete: false },
    ...overrides,
  } as unknown as RunbookCheckContext;
}

/** Context whose service resolution records the target and fails with `failure`. */
function contextWith(failure: Error): RunbookCheckContext {
  return checkContext({
    servicesFor: async (): Promise<ResolvedServiceRegistry> => {
      await Promise.resolve();
      throw failure;
    },
  });
}

/** Cache that never hits, recording the keys read and written. */
function recordingCache(): { readonly cache: RunbookCheckCache; readonly reads: string[]; readonly writes: string[] } {
  const reads: string[] = [];
  const writes: string[] = [];
  const cache: RunbookCheckCache = {
    get: async (key: string) => {
      await Promise.resolve();
      reads.push(key);
      return undefined;
    },
    set: async (key: string) => {
      await Promise.resolve();
      writes.push(key);
    },
  };
  return { cache, reads, writes };
}

interface AccountScopedResolver {
  readonly servicesFor: ServiceRegistryResolverFn;
  readonly targets: AWSExecutionTarget[];
  readonly queriedBy: ReadonlyMap<string, string[]>;
  readonly reportedProfiles: string[][];
}

/**
 * Records, per profile, the log groups that profile's services were asked for.
 *
 * The registries are what an account-scoped resolution hands back, so a query
 * landing in the wrong bucket is exactly the bug this file guards: log group
 * names repeat identically across environments, and the prod profile answers a
 * uat query successfully and with no rows.
 */
function accountScopedResolver(): AccountScopedResolver {
  const targets: AWSExecutionTarget[] = [];
  const reportedProfiles: string[][] = [];
  const queriedBy = new Map<string, string[]>([
    ['sso_prod', []],
    ['sso_uat', []],
  ]);

  const registryFor = (profile: string): ServiceRegistry =>
    createTestServiceRegistry({
      cloudWatchLogs: {
        query: async (
          logGroups: ReadonlyArray<string>,
        ): Promise<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>> => {
          await Promise.resolve();
          // Safe: both profiles are seeded above.
          queriedBy.get(profile)!.push(...logGroups);
          return [];
        },
      },
    });

  const servicesFor = async (target: AWSExecutionTarget): Promise<ResolvedServiceRegistry> => {
    await Promise.resolve();
    targets.push(target);
    const profile = target.accountId === UAT_ACCOUNT ? 'sso_uat' : 'sso_prod';
    reportedProfiles.push([profile]);
    return { services: registryFor(profile), awsProfiles: [profile] };
  };

  return { servicesFor, targets, queriedBy, reportedProfiles };
}

describe('checkOccurrence', () => {
  it('runs the runbook against the account of the occurrence only, reporting only its profile', async () => {
    const cases = [
      { accountId: UAT_ACCOUNT, used: 'sso_uat', untouched: 'sso_prod' },
      { accountId: PROD_ACCOUNT, used: 'sso_prod', untouched: 'sso_uat' },
    ] as const;

    for (const { accountId, used, untouched } of cases) {
      const resolver = accountScopedResolver();
      const context = checkContext({ servicesFor: resolver.servicesFor, awsProfiles: ['sso_prod', 'sso_uat'] });

      const row = await checkOccurrence({ context, occurrence: { ...OCCURRENCE, awsAccountId: accountId } });

      assert.notStrictEqual(row.runbook.status, 'EXECUTION-ERROR', row.runbook.error ?? '');
      assert.notStrictEqual(row.runbook.status, 'CONFIG-ERROR', row.runbook.error ?? '');
      assert.deepStrictEqual(resolver.targets, [{ accountId, region: 'eu-south-1' }]);
      assert.ok((resolver.queriedBy.get(used) ?? []).length > 0, `${used} must serve its own occurrence`);
      assert.deepStrictEqual(resolver.queriedBy.get(untouched), [], `${untouched} must never be queried`);
      // The execution telemetry claims what was read: on a multi-account run the
      // configured list names accounts this occurrence never touched.
      assert.deepStrictEqual(resolver.reportedProfiles, [[used]]);
    }
  });

  it('reports an unconfigured AWS target as CONFIG-ERROR naming the fault, without local profile names', async () => {
    // Deterministic for the whole run: reporting it among the execution errors
    // would bury a misconfiguration in the transient failures.
    const cases = [
      ['AWS_ACCOUNT_NOT_CONFIGURED', `No configured AWS profile resolves to account ${UAT_ACCOUNT}`, /222222222222/u],
      ['AWS_REGION_NOT_CONFIGURED', 'clients are configured for eu-south-1', /eu-south-1/u],
      [
        'AWS_PROFILE_IDENTITY_UNAVAILABLE',
        'Configured profiles: sso_prod — sso_prod: ExpiredToken (profile: sso_prod)',
        /ExpiredToken/u,
      ],
    ] as const;

    for (const [code, message, expected] of cases) {
      const context = contextWith(new AWSTargetNotConfiguredError(code, message));

      const row = await checkOccurrence({ context, occurrence: OCCURRENCE });

      assert.strictEqual(row.runbook.status, 'CONFIG-ERROR', code);
      assert.match(row.runbook.error ?? '', expected);
      assert.doesNotMatch(row.runbook.error ?? '', /sso_prod/u);
      assert.deepStrictEqual(row.comparison.reasons, ['Runbook non eseguito (target AWS non configurato).']);
    }
  });

  it('still reports an ordinary failure as EXECUTION-ERROR', async () => {
    const row = await checkOccurrence({
      context: contextWith(new Error('CloudWatch Logs query Timeout')),
      occurrence: OCCURRENCE,
    });

    assert.strictEqual(row.runbook.status, 'EXECUTION-ERROR');
    assert.deepStrictEqual(row.comparison.reasons, ['Runbook non eseguito (errore di esecuzione).']);
  });
});

describe('checkOccurrence — logical AWS accounts', () => {
  it('reports a directory that cannot serve the occurrence as CONFIG-ERROR, before the cache and the services', async () => {
    let servicesResolved = 0;
    const { cache, reads } = recordingCache();
    const context = checkContext({
      servicesFor: async (): Promise<ResolvedServiceRegistry> => {
        await Promise.resolve();
        servicesResolved += 1;
        throw new Error('services must not be resolved');
      },
      alarmName: 'pn-logsaver-be-FailedInvocation-Alarm',
      awsProfiles: ['profile-a'],
      runbook: resolveRunbookCacheDescriptor('pn-logsaver-be-FailedInvocation-Alarm'),
      force: false,
      accounts: {
        port: new InMemoryAwsAccountsPort({
          directory: parseAwsAccountDirectory(['send/core/prod=000000000101']),
          region: 'eu-south-1',
        }),
        binding: 'profiles',
        permissionSets: [],
      },
    });

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE, cache });

    assert.strictEqual(row.runbook.status, 'CONFIG-ERROR');
    assert.match(row.runbook.error ?? '', /not in the account directory/u);
    assert.strictEqual(servicesResolved, 0);
    assert.deepStrictEqual(reads, []);
  });

  it('does not cache an output that failed because CloudWatch Logs denied access', async () => {
    const { cache, writes } = recordingCache();
    const context = checkContext({
      servicesFor: async (): Promise<ResolvedServiceRegistry> => {
        await Promise.resolve();
        const services = createTestServiceRegistry({
          cloudWatchLogs: {
            query: async () => {
              await Promise.resolve();
              // The message go-aws actually emits for an AccessDeniedException.
              throw new Error('CloudWatch Logs StartQuery access denied (profile: profile-a)');
            },
          },
        });
        return { services, awsProfiles: ['profile-a'] };
      },
      awsProfiles: ['profile-a'],
      runbook: resolveRunbookCacheDescriptor(ALARM_NAME),
      force: false,
    });

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE, cache });

    assert.match(row.runbook.error ?? '', /access denied/u);
    assert.doesNotMatch(row.runbook.error ?? '', /profile-a/u);
    assert.deepStrictEqual(writes, []);
  });

  it('does not cache a denied read even when the profiles are called like the words of the failure', async () => {
    // Profile names are arbitrary: 'access' and 'denied' must not hide an access denial
    // from the cache classification.
    const { row, writes } = await runLogsaverWithFailingReader(
      new Error('CloudWatch Logs StartQuery access denied (profile: access)'),
      ['access', 'denied'],
    );

    assert.match(row.runbook.error ?? '', /^Logsaver diagnostics failed: CloudWatch Logs StartQuery /u);
    assert.doesNotMatch(row.runbook.error ?? '', /\(profile:/u);
    assert.deepStrictEqual(writes, []);
  });

  // Every provider failure the account reader normalizes: the IMDS provider throws
  // the base ProviderError on a metadata-service timeout.
  it('does not cache a read that failed with any SDK credentials provider error', async () => {
    for (const name of ['CredentialsProviderError', 'TokenProviderError', 'ProviderError']) {
      const cause = Object.assign(new Error('Profile sso-secret could not resolve credentials'), { name });
      const { row, writes } = await runLogsaverWithFailingReader(
        new Error(`CloudWatch Logs StartQuery failed: ${cause.message} (profile: sso-secret)`, { cause }),
        ['sso-secret'],
      );

      assert.match(row.runbook.error ?? '', new RegExp(`\\[${name}\\] AWS credentials could not be resolved`, 'u'));
      assert.doesNotMatch(row.runbook.error ?? '', /secret/u);
      assert.deepStrictEqual(writes, []);
    }
  });
});

/**
 * Runs the logsaver runbook through a real oam `RuntimeAwsAccountsPort` whose monitoring
 * reader throws `failure`, recording the cache writes.
 */
async function runLogsaverWithFailingReader(
  failure: Error,
  profiles: ReadonlyArray<string>,
): Promise<{ readonly row: Awaited<ReturnType<typeof checkOccurrence>>; readonly writes: ReadonlyArray<string> }> {
  // Safe: the port only calls forTarget and query on the monitoring reader.
  const monitoring = {
    forTarget: () => monitoring,
    query: async () => {
      await Promise.resolve();
      throw failure;
    },
  } as unknown as AWSCloudWatchLogsQueryService;
  const context = checkContext({
    servicesFor: async (): Promise<ResolvedServiceRegistry> => {
      await Promise.resolve();
      return { services: createTestServiceRegistry({}), awsProfiles: [...profiles] };
    },
    alarmName: 'pn-logsaver-be-FailedInvocation-Alarm',
    awsProfiles: [...profiles],
    runbook: resolveRunbookCacheDescriptor('pn-logsaver-be-FailedInvocation-Alarm'),
    force: false,
    accounts: {
      port: new RuntimeAwsAccountsPort({
        directory: parseAwsAccountDirectory(['send/core/prod=000000000101', 'send/confinfo/prod=000000000102']),
        region: 'eu-south-1',
        binding: 'oam',
        monitoring,
      }),
      binding: 'oam',
      permissionSets: [],
    },
  });
  const { cache, writes } = recordingCache();

  const row = await checkOccurrence({ context, occurrence: { ...OCCURRENCE, awsAccountId: '000000000101' }, cache });
  return { row, writes };
}
