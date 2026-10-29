import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { SIGNED_OBJECTS_PERSISTER_ALARM as ALARM } from '../alarmDefinition.js';
import { SIGNED_OBJECTS_PERSISTER_QUERY_PROFILE as PROFILE } from '../queryProfile.js';
import { K8S_INTEROP_BE_SIGNED_OBJECTS_PERSISTER_ERRORS_PROD_REGISTRATION as REGISTRATION } from '../registration.js';
import { buildRunbook } from '../runbook.js';

const CONFLICT =
  'Generic error occurs processing Queue: https://sqs.example/interop-safe-storage-completed-tasks-prod. Details: AxiosError: Request failed with status code 409\n    at async addAgreementSignedContract (metadata.js:14:5)';

interface TestExecution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
  readonly logGroups: ReadonlyArray<string>;
  readonly resolutionModes: ReadonlyArray<unknown>;
}

async function execute(
  messages: ReadonlyArray<string>,
  cid?: string,
  trackerMessages: ReadonlyArray<string> = [],
): Promise<TestExecution> {
  const queries: string[] = [];
  const logGroups: string[] = [];
  const resolutionModes: unknown[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(
      groups: ReadonlyArray<string>,
      query: string,
      _timeRange: unknown,
      options?: { readonly logGroupResolutionMode?: string },
    ): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      queries.push(query);
      logGroups.push(...groups);
      resolutionModes.push(options?.logGroupResolutionMode);
      const tracker = query.includes('filter cid =');
      const podApp = tracker ? 'interop-be-another-service' : ALARM.podApp;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> = (tracker ? trackerMessages : messages).map((message) => [
        { field: 'pod_app', value: podApp },
        {
          field: '@message',
          value: JSON.stringify({
            log: `${cid === undefined ? '' : `[CID=${cid}] `}${message}`,
            pod_app: podApp,
            stream: 'stderr',
            pod_namespace: 'prod',
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
      ['startTime', '2026-10-08T11:44:49.000Z'],
      ['endTime', '2026-10-08T11:54:49.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries, logGroups, resolutionModes };
}

describe('Signed objects persister production runbook', () => {
  it('registers only the documented production K8s alarm with a read-only pipeline', () => {
    assert.strictEqual(REGISTRATION.kind, 'K8S');
    assert.strictEqual(REGISTRATION.product, 'INTEROP');
    assert.deepStrictEqual(REGISTRATION.alarmNames, [ALARM.runbookKey]);
    for (const environment of ['att', 'test', 'dev']) {
      assert.throws(() => ALARM.resolveContext(ALARM.runbookKey.replace(/prod$/u, environment)), /Unsupported/u);
    }
    const runbook = REGISTRATION.build();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        ALARM.stepIds.resolveContext,
        ALARM.stepIds.queryApplicationLogs,
        ALARM.stepIds.analyzeApplicationLogs,
        ALARM.stepIds.queryCidTracker,
        ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.strictEqual(runbook.occurrenceTimeWindow, undefined);
    assert.ok(runbook.analysisDefaults?.links?.[0]?.url.includes('/2468478981/'));
  });

  it('queries the exact pod and the application error field', () => {
    const query = PROFILE.buildApplicationLogsQuery(ALARM.podApp);
    assert.match(query, /filter \(log like \/ERROR\/ or stream = "stderr"\)/u);
    assert.match(query, /pod_app = "interop-be-signed-objects-persister"/u);
    assert.doesNotMatch(query, /@message like \/ERROR\/|pod_app like/u);
  });

  it('preserves the documented embedded-date CID chronology and escapes query values', () => {
    const query = PROFILE.buildCidTrackerQuery('cid"\\value');
    assert.ok(query.includes('parse log /(?<date>^[^\\s]+)/'));
    assert.match(query, /sort date asc/u);
    assert.doesNotMatch(query, /sort @timestamp/u);
    assert.ok(query.includes('filter cid = "cid\\"\\\\value"'));
    assert.ok(PROFILE.buildApplicationLogsQuery('pod"\\value').includes('pod_app = "pod\\"\\\\value"'));
  });

  it('recognizes a complete conflict without a CID and keeps its resolution open', async () => {
    const { result, draft, queries, logGroups, resolutionModes } = await execute([CONFLICT]);
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['signed-objects-agreement-signed-contract-http-409'],
    );
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.finalActions, []);
    assert.ok(draft.conclusionNotes?.includes('Risoluzione non documentata.'));
    assert.ok(draft.links.some(({ url }) => url.endsWith('p1791464214954779')));
    assert.strictEqual(queries.length, 1);
    assert.match(queries[0] ?? '', /pod_app = "interop-be-signed-objects-persister"/u);
    assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-prod/application']);
    assert.deepStrictEqual(resolutionModes, ['search-configured-profiles']);
    assert.strictEqual(result.finalContext.vars.get(`${ALARM.varPrefix}CidCount`), '0');
  });

  it('collects a CID trace without treating later success as recovery', async () => {
    const { result, draft, queries } = await execute([CONFLICT], 'synthetic-cid', [
      'INFO - Message processed successfully',
    ]);
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(draft.finalActions, []);
    assert.strictEqual(queries.length, 2);
    assert.match(queries[1] ?? '', /filter cid = "synthetic-cid"/u);
    assert.match(queries[1] ?? '', /sort date asc/u);
    assert.strictEqual(result.finalContext.vars.get(`${ALARM.varPrefix}CidCount`), '1');
  });

  it('does not attribute another service’s conflict in a shared trace to the persister', async () => {
    const { result, draft } = await execute(['ERROR - Unknown failure'], 'shared-cid', [CONFLICT]);
    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
  });

  it('keeps missing evidence and generic consumer errors unknown', async () => {
    for (const messages of [
      [],
      ['Unexpected error consuming message: AxiosError: Request failed with status code 409'],
    ]) {
      const { result, draft } = await execute(messages);
      assert.deepStrictEqual(result.matchedCases, []);
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    }
  });
});
