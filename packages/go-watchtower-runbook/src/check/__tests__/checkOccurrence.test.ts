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

function contextWith(failure: Error): { context: RunbookCheckContext; targets: AWSExecutionTarget[] } {
  const targets: AWSExecutionTarget[] = [];
  const servicesFor = async (target: AWSExecutionTarget): Promise<ResolvedServiceRegistry> => {
    await Promise.resolve();
    targets.push(target);
    throw failure;
  };

  // Safe: the failure path returns before the client, the matcher or the cache
  // descriptor are read.
  const context = {
    servicesFor,
    engineLogger: new GOLogger(),
    alarmName: ALARM_NAME,
    awsProfiles: ['sso_prod'],
    runbook: undefined,
    force: true,
    analysisCache: new Map(),
  } as unknown as RunbookCheckContext;

  return { context, targets };
}

const NO_MATCH: AnalysisMatch = {
  status: 'NOT_LINKED',
  confidence: 0,
  reasons: [],
  signals: {
    caseIdMentioned: false,
    descriptionOverlap: 0,
    traceIdOverlap: [],
    downstreamOverlap: [],
    errorKeywordOverlap: [],
  },
};

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
  it('runs the runbook against the account of the occurrence, leaving the other one untouched', async () => {
    const resolver = accountScopedResolver();
    // Safe: the occurrence carries no analysis id, so the Watchtower client is
    // never reached.
    const context = {
      servicesFor: resolver.servicesFor,
      engineLogger: new GOLogger(),
      alarmName: ALARM_NAME,
      awsProfiles: ['sso_prod', 'sso_uat'],
      runbook: undefined,
      force: true,
      analysisCache: new Map(),
      analysisMatcher: async (): Promise<AnalysisMatch> => Promise.resolve(NO_MATCH),
      matchOptions: { includeIgnorable: false, includeIncomplete: false },
    } as unknown as RunbookCheckContext;

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE });

    assert.notStrictEqual(row.runbook.status, 'EXECUTION-ERROR', row.runbook.error ?? '');
    assert.notStrictEqual(row.runbook.status, 'CONFIG-ERROR', row.runbook.error ?? '');
    assert.deepStrictEqual(resolver.targets, [{ accountId: UAT_ACCOUNT, region: 'eu-south-1' }]);
    assert.ok((resolver.queriedBy.get('sso_uat') ?? []).length > 0, 'the uat profile must serve the uat occurrence');
    assert.deepStrictEqual(resolver.queriedBy.get('sso_prod'), [], 'the prod profile must never be queried');
  });

  it('reports the profiles bound to the occurrence, not every profile of the run', async () => {
    // The execution telemetry claims what was read: on a multi-account run the
    // configured list names accounts this occurrence never touched.
    const resolver = accountScopedResolver();
    const prodOccurrence = { ...OCCURRENCE, awsAccountId: PROD_ACCOUNT };
    // Safe: same shape as the test above.
    const context = {
      servicesFor: resolver.servicesFor,
      engineLogger: new GOLogger(),
      alarmName: ALARM_NAME,
      awsProfiles: ['sso_prod', 'sso_uat'],
      runbook: undefined,
      force: true,
      analysisCache: new Map(),
      analysisMatcher: async (): Promise<AnalysisMatch> => Promise.resolve(NO_MATCH),
      matchOptions: { includeIgnorable: false, includeIncomplete: false },
    } as unknown as RunbookCheckContext;

    await checkOccurrence({ context, occurrence: prodOccurrence });

    assert.deepStrictEqual(resolver.reportedProfiles, [['sso_prod']]);
    assert.deepStrictEqual(resolver.queriedBy.get('sso_uat'), []);
  });

  it('resolves the services against the account and region of the occurrence', async () => {
    const { context, targets } = contextWith(new Error('stop here'));

    await checkOccurrence({ context, occurrence: OCCURRENCE });

    assert.deepStrictEqual(targets, [{ accountId: UAT_ACCOUNT, region: 'eu-south-1' }]);
  });

  it('reports an unconfigured AWS target as CONFIG-ERROR', async () => {
    // Deterministic for the whole run: reporting it among the execution errors
    // would bury a misconfiguration in the transient failures.
    const { context } = contextWith(
      new AWSTargetNotConfiguredError(
        'AWS_ACCOUNT_NOT_CONFIGURED',
        `No configured AWS profile resolves to account ${UAT_ACCOUNT}`,
      ),
    );

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE });

    assert.strictEqual(row.runbook.status, 'CONFIG-ERROR');
    assert.match(row.runbook.error ?? '', /222222222222/u);
  });

  it('names the configuration fault in the comparison, instead of an execution error', async () => {
    const { context } = contextWith(
      new AWSTargetNotConfiguredError('AWS_REGION_NOT_CONFIGURED', 'clients are configured for eu-south-1'),
    );

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE });

    assert.deepStrictEqual(row.comparison.reasons, ['Runbook non eseguito (target AWS non configurato).']);
  });

  it('reports an unresolvable profile identity as CONFIG-ERROR too', async () => {
    const { context } = contextWith(
      new AWSTargetNotConfiguredError('AWS_PROFILE_IDENTITY_UNAVAILABLE', 'sso_uat: ExpiredToken'),
    );

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE });

    assert.strictEqual(row.runbook.status, 'CONFIG-ERROR');
    assert.match(row.runbook.error ?? '', /ExpiredToken/u);
  });

  it('still reports an ordinary failure as EXECUTION-ERROR', async () => {
    const { context } = contextWith(new Error('CloudWatch Logs query Timeout'));

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE });

    assert.strictEqual(row.runbook.status, 'EXECUTION-ERROR');
    assert.deepStrictEqual(row.comparison.reasons, ['Runbook non eseguito (errore di esecuzione).']);
  });
});

describe('checkOccurrence — logical AWS accounts (EVO-AWSACCT-OPUS-01 §6.5)', () => {
  it('reports a directory that cannot serve the occurrence as CONFIG-ERROR, before the cache and the services', async () => {
    const targets: AWSExecutionTarget[] = [];
    const cacheReads: string[] = [];
    const context = {
      servicesFor: async (target: AWSExecutionTarget): Promise<ResolvedServiceRegistry> => {
        await Promise.resolve();
        targets.push(target);
        throw new Error('services must not be resolved');
      },
      engineLogger: new GOLogger(),
      alarmName: 'pn-logsaver-be-FailedInvocation-Alarm',
      awsProfiles: ['profile-a'],
      runbook: resolveRunbookCacheDescriptor('pn-logsaver-be-FailedInvocation-Alarm'),
      force: false,
      analysisCache: new Map(),
      accounts: {
        port: new InMemoryAwsAccountsPort({
          directory: parseAwsAccountDirectory(['send/core/prod=000000000101']),
          region: 'eu-south-1',
        }),
        binding: 'profiles',
        permissionSets: [],
      },
    } as unknown as RunbookCheckContext;
    // Safe: only the read side of the cache is observed.
    const cache = {
      get: async (key: string) => {
        await Promise.resolve();
        cacheReads.push(key);
        return undefined;
      },
    } as unknown as RunbookCheckCache;

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE, cache });

    assert.strictEqual(row.runbook.status, 'CONFIG-ERROR');
    assert.match(row.runbook.error ?? '', /not in the account directory/u);
    assert.deepStrictEqual(targets, []);
    assert.deepStrictEqual(cacheReads, []);
  });

  it('keeps local profile names out of a failed row', async () => {
    const { context } = contextWith(
      new AWSTargetNotConfiguredError(
        'AWS_PROFILE_IDENTITY_UNAVAILABLE',
        'Configured profiles: sso_prod — sso_prod: ExpiredToken (profile: sso_prod)',
      ),
    );

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE });

    assert.doesNotMatch(row.runbook.error ?? '', /sso_prod/u);
    assert.match(row.runbook.error ?? '', /ExpiredToken/u);
  });

  it('does not cache an output that failed because CloudWatch Logs denied access', async () => {
    const writes: string[] = [];
    const servicesFor = async (): Promise<ResolvedServiceRegistry> => {
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
    };
    // Safe: the occurrence has no analysis id, so client and matcher only see the output.
    const context = {
      servicesFor,
      engineLogger: new GOLogger(),
      alarmName: ALARM_NAME,
      awsProfiles: ['profile-a'],
      runbook: resolveRunbookCacheDescriptor(ALARM_NAME),
      force: false,
      analysisCache: new Map(),
      analysisMatcher: async () => Promise.resolve(NO_MATCH),
      matchOptions: { includeIgnorable: false, includeIncomplete: false },
    } as unknown as RunbookCheckContext;
    // Safe: only the cache calls are observed.
    const cache = {
      get: async () => Promise.resolve(undefined),
      set: async (key: string) => {
        await Promise.resolve();
        writes.push(key);
      },
    } as unknown as RunbookCheckCache;

    const row = await checkOccurrence({ context, occurrence: OCCURRENCE, cache });

    assert.match(row.runbook.error ?? '', /access denied/u);
    assert.doesNotMatch(row.runbook.error ?? '', /profile-a/u);
    assert.deepStrictEqual(writes, []);
  });

  it('does not cache a denied read even when the profiles are called like the words of the failure', async () => {
    // Profile names are arbitrary: 'access' and 'denied' must not hide an access denial
    // from the cache classification (AWSACCT-A45-06).
    const { row, writes } = await runLogsaverWithFailingReader(
      new Error('CloudWatch Logs StartQuery access denied (profile: access)'),
      ['access', 'denied'],
    );

    assert.match(row.runbook.error ?? '', /^Logsaver diagnostics failed: CloudWatch Logs StartQuery /u);
    assert.doesNotMatch(row.runbook.error ?? '', /\(profile:/u);
    assert.deepStrictEqual(writes, []);
  });

  // Every provider failure the account reader normalizes (AWSACCT-A45-08/09): the IMDS
  // provider throws the base ProviderError on a metadata-service timeout.
  for (const name of ['CredentialsProviderError', 'TokenProviderError', 'ProviderError']) {
    it(`does not cache a read that failed with an SDK ${name}`, async () => {
      const cause = Object.assign(new Error('Profile sso-secret could not resolve credentials'), { name });
      const { row, writes } = await runLogsaverWithFailingReader(
        new Error(`CloudWatch Logs StartQuery failed: ${cause.message} (profile: sso-secret)`, { cause }),
        ['sso-secret'],
      );

      assert.match(row.runbook.error ?? '', new RegExp(`\\[${name}\\] AWS credentials could not be resolved`, 'u'));
      assert.doesNotMatch(row.runbook.error ?? '', /secret/u);
      assert.deepStrictEqual(writes, []);
    });
  }
});

/**
 * Runs the logsaver runbook through a real oam `RuntimeAwsAccountsPort` whose monitoring
 * reader throws `failure`, recording the cache writes.
 */
async function runLogsaverWithFailingReader(
  failure: Error,
  profiles: ReadonlyArray<string>,
): Promise<{ readonly row: Awaited<ReturnType<typeof checkOccurrence>>; readonly writes: ReadonlyArray<string> }> {
  const writes: string[] = [];
  // Safe: the port only calls forTarget and query on the monitoring reader.
  const monitoring = {
    forTarget: () => monitoring,
    query: async () => {
      await Promise.resolve();
      throw failure;
    },
  } as unknown as AWSCloudWatchLogsQueryService;
  // Safe: the occurrence has no analysis id, so client and matcher only see the output.
  const context = {
    servicesFor: async (): Promise<ResolvedServiceRegistry> => {
      await Promise.resolve();
      return { services: createTestServiceRegistry({}), awsProfiles: [...profiles] };
    },
    engineLogger: new GOLogger(),
    alarmName: 'pn-logsaver-be-FailedInvocation-Alarm',
    awsProfiles: [...profiles],
    runbook: resolveRunbookCacheDescriptor('pn-logsaver-be-FailedInvocation-Alarm'),
    force: false,
    analysisCache: new Map(),
    analysisMatcher: async () => Promise.resolve(NO_MATCH),
    matchOptions: { includeIgnorable: false, includeIncomplete: false },
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
  } as unknown as RunbookCheckContext;
  // Safe: only the cache calls are observed.
  const cache = {
    get: async () => Promise.resolve(undefined),
    set: async (key: string) => {
      await Promise.resolve();
      writes.push(key);
    },
  } as unknown as RunbookCheckCache;

  const row = await checkOccurrence({ context, occurrence: { ...OCCURRENCE, awsAccountId: '000000000101' }, cache });
  return { row, writes };
}
