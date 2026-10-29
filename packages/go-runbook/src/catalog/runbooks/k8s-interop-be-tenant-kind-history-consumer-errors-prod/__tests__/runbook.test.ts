import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { computeRunbookTimeRange } from '../../../computeRunbookTimeRange.js';
import { TENANT_KIND_HISTORY_ALARM as ALARM } from '../alarmDefinition.js';
import { TENANT_KIND_HISTORY_QUERY_PROFILE as PROFILE } from '../queryProfile.js';
import { buildRunbook } from '../runbook.js';

const HEARTBEAT = 'ERROR - Response Heartbeat(key: 12, version: 3) - The coordinator is not aware of this member';

interface TestExecution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
  readonly logGroups: ReadonlyArray<string>;
}

async function execute(
  messages: ReadonlyArray<string>,
  cid?: string,
  trackerMessages: ReadonlyArray<string> = [],
): Promise<TestExecution> {
  const queries: string[] = [];
  const logGroups: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(
      groups: ReadonlyArray<string>,
      query: string,
      _range: unknown,
      options?: { readonly logGroupResolutionMode?: string },
    ): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      assert.equal(options?.logGroupResolutionMode, 'search-configured-profiles');
      queries.push(query);
      logGroups.push(...groups);
      const tracker = query.includes('filter cid =');
      const podApp = tracker ? 'interop-be-another-service' : ALARM.podApp;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> = (tracker ? trackerMessages : messages).map((message) => [
        { field: 'pod_app', value: podApp },
        {
          field: '@message',
          value: JSON.stringify({
            log: `${cid === undefined ? '' : `[CID=${cid}] `}${message}`,
            pod_app: podApp,
            pod_namespace: 'prod',
            stream: 'stderr',
          }),
        },
      ]);
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', ALARM.runbookKey],
      ['startTime', '2026-10-19T15:21:15.000Z'],
      ['endTime', '2026-10-19T15:27:15.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries, logGroups };
}

describe('Tenant kind history consumer production runbook', () => {
  it('registers the documented Prod-only INTEROP K8s alarm with a read-only pipeline', () => {
    const registered = RUNBOOK_CATALOG.resolveByAlarmName(ALARM.runbookKey);
    assert.ok(registered);
    assert.equal(registered.product, 'INTEROP');
    assert.equal(registered.descriptor.kind, 'K8S');
    assert.deepEqual(registered.descriptor.alarmNames, [ALARM.runbookKey]);
    const runbook = registered.build();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        ALARM.stepIds.resolveContext,
        ALARM.stepIds.queryApplicationLogs,
        ALARM.stepIds.analyzeApplicationLogs,
        ALARM.stepIds.queryCidTracker,
        ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.ok(runbook.analysisDefaults?.links?.[0]?.url.includes('/3418358502/'));
    for (const environment of ['att', 'test', 'dev']) {
      assert.throws(() => ALARM.resolveContext(ALARM.runbookKey.replace(/prod$/u, environment)), /Unsupported/u);
    }
  });

  it('uses the source diagnostic window of five minutes before and one after', () => {
    const runbook = buildRunbook();
    assert.deepEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepEqual(computeRunbookTimeRange(runbook, { kind: 'single', at: '2026-10-19T15:26:15.000Z' }), {
      startTime: '2026-10-19T15:21:15.000Z',
      endTime: '2026-10-19T15:27:15.000Z',
    });
  });

  it('queries ERROR in log or stderr for the exact production service', () => {
    const query = PROFILE.buildApplicationLogsQuery(ALARM.podApp);
    assert.match(query, /filter \(log like \/ERROR\/ or stream = "stderr"\)/u);
    assert.ok(query.includes('pod_namespace = "prod" and pod_app = "interop-be-tenant-kind-history-consumer"'));
    assert.doesNotMatch(query, /@message like \/ERROR\/|pod_app like/u);
    assert.ok(PROFILE.buildApplicationLogsQuery('pod"\\value').includes('pod_app = "pod\\"\\\\value"'));
  });

  it('retains timestamp ordering and escapes CID query values', () => {
    const query = PROFILE.buildCidTrackerQuery('cid"\\value');
    assert.ok(query.includes('filter cid = "cid\\"\\\\value"'));
    assert.ok(query.includes('sort @timestamp asc'));
  });

  it('recognizes Heartbeat errors without a CID and keeps the conditional guidance open', async () => {
    const { result, draft, queries, logGroups } = await execute([HEARTBEAT]);
    assert.equal(result.status, 'completed');
    assert.deepEqual(
      result.matchedCases.map(({ id }) => id),
      ['tenant-kind-history-kafka-coordinator-errors'],
    );
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft.proposedStatus, 'IN_PROGRESS');
    assert.match(draft.conclusionNotes ?? '', /se la situazione perdura nel tempo, aprire un thread/u);
    assert.deepEqual(draft.finalActions, []);
    assert.equal(queries.length, 1);
    assert.deepEqual(logGroups, ['/aws/eks/interop-eks-cluster-prod/application']);
    assert.equal(result.finalContext.vars.get(`${ALARM.varPrefix}CidCount`), '0');
  });

  it('collects a CID trace without interpreting later success as recovery', async () => {
    const { result, draft, queries } = await execute([HEARTBEAT], 'synthetic-cid', ['INFO - Consumer reconnected']);
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepEqual(draft.finalActions, []);
    assert.equal(queries.length, 2);
    assert.ok(queries[1]?.includes('filter cid = "synthetic-cid"'));
    assert.equal(result.finalContext.vars.get(`${ALARM.varPrefix}CidCount`), '1');
  });

  it('does not attribute another service’s coordinator failure from a shared CID', async () => {
    const { result, draft } = await execute(['ERROR - Unknown failure'], 'shared-cid', [HEARTBEAT]);
    assert.deepEqual(result.matchedCases, []);
    assert.equal(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
  });

  it('keeps missing evidence and undocumented connection failures unknown', async () => {
    for (const messages of [[], ['Connection error: connect ETIMEDOUT'], ['Connection error: connect ECONNREFUSED']]) {
      const { result, draft } = await execute(messages);
      assert.deepEqual(result.matchedCases, []);
      assert.equal(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });

  it('recognizes the real incorrect-coordinator family without inheriting maintenance completion', async () => {
    const { result, draft } = await execute([
      'ERROR - Response JoinGroup(key: 11, version: 5) - This is not the correct coordinator for this group',
      'ERROR - Crash: KafkaJSNonRetriableError: This is not the correct coordinator for this group',
    ]);
    assert.deepEqual(
      result.matchedCases.map(({ id }) => id),
      ['tenant-kind-history-kafka-incorrect-coordinator'],
    );
    assert.equal(draft?.kind, 'KNOWN_CASE');
    assert.equal(draft.proposedStatus, 'IN_PROGRESS');
    assert.equal(draft.conclusionNotes, 'Risoluzione non documentata.');
    assert.deepEqual(draft.finalActions, []);
  });
});
