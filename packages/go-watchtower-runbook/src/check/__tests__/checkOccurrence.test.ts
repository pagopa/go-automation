import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';
import { AWSTargetNotConfiguredError } from '@go-automation/go-common/aws';
import type { AWSExecutionTarget, ResultField } from '@go-automation/go-common/aws';
import { createTestServiceRegistry } from '@go-automation/go-runbook';
import type { ResolvedServiceRegistry, ServiceRegistry, ServiceRegistryResolverFn } from '@go-automation/go-runbook';
import type { AlarmEventDto } from '@go-automation/go-watchtower-client';

import { checkOccurrence } from '../checkOccurrence.js';
import type { RunbookCheckContext } from '../checkOccurrence.js';
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
    engineLogger: new Core.GOLogger(),
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
        query: async (logGroups: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> => {
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
      engineLogger: new Core.GOLogger(),
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
      engineLogger: new Core.GOLogger(),
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
