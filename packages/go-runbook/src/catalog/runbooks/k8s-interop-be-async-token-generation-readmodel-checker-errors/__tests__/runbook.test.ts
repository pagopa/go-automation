import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { computeRunbookTimeRange } from '../../../computeRunbookTimeRange.js';
import { INTEROP_DOWNSTREAMS } from '../../framework.js';
import { ASYNC_TOKEN_GENERATION_READMODEL_CHECKER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const MESSAGE =
  'Differences in platform-states when checking catalog entry ' +
  'ESERVICEDESCRIPTOR#2d9d036e-7d4a-4634-8506-ea8ed67b291c#755022d4-cfad-4da9-b188-187c4c4743c9';
const CONFLUENCE_URL =
  'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3206578389/k8s-interop-be-async-token-generation-readmodel-checker-errors';

interface Scenario {
  readonly applicationMessage?: string;
  readonly cid?: string;
  readonly trackerMessage?: string;
  readonly trackerPodApp?: string;
  readonly plainLog?: boolean;
}

interface Execution {
  readonly result: RunbookExecutionResult;
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly queries: ReadonlyArray<string>;
  readonly logGroups: ReadonlyArray<string>;
}

async function execute(scenario: Scenario): Promise<Execution> {
  const queries: string[] = [];
  const logGroups: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      queries.push(query);
      logGroups.push(...groups);
      const tracker = query.includes('filter cid =');
      const message = tracker ? scenario.trackerMessage : scenario.applicationMessage;
      const podApp = tracker ? (scenario.trackerPodApp ?? 'interop-be-catalog-process') : alarm.podApp;
      const log = `2026-10-12T10:00:00.000Z ERROR [async-token-generation-readmodel-checker] - ${
        scenario.cid === undefined ? '' : `[CID=${scenario.cid}] `
      }${message ?? ''}`;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
        message === undefined
          ? []
          : [
              [
                { field: '@timestamp', value: '2026-10-12 10:00:00.000' },
                { field: 'pod_app', value: podApp },
                {
                  field: scenario.plainLog === true ? 'log' : '@message',
                  value: scenario.plainLog === true ? log : JSON.stringify({ log, pod_app: podApp, stream: 'stderr' }),
                },
              ],
            ];
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const { startTime, endTime } = computeRunbookTimeRange(runbook, {
    kind: 'single',
    at: '2026-10-12T10:00:00.000Z',
  });
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', `${alarm.runbookKey}-att`],
      ['startTime', startTime],
      ['endTime', endTime],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { result, draft: buildAnalysisDraft(runbook, result), queries, logGroups };
}

describe('async token generation readmodel checker', () => {
  it('registers only the documented Att alarm and rejects unsupported environments and services', () => {
    const resolved = RUNBOOK_CATALOG.resolveByAlarmName(`${alarm.runbookKey}-att`);
    assert.ok(resolved);
    assert.strictEqual(resolved.descriptor.key, alarm.runbookKey);
    assert.strictEqual(resolved.product, 'INTEROP');
    assert.strictEqual(resolved.descriptor.kind, 'K8S');
    assert.deepStrictEqual(resolved.descriptor.alarmNames, [`${alarm.runbookKey}-att`]);
    assert.strictEqual(alarm.resolveContext(`${alarm.runbookKey}-att`).environment, 'att');
    assert.strictEqual(
      alarm.resolveContext(`${alarm.runbookKey}-att`).logGroup,
      '/aws/eks/interop-eks-cluster-att/application',
    );
    for (const name of [
      `${alarm.runbookKey}-prod`,
      `${alarm.runbookKey}-test`,
      `${alarm.runbookKey}-dev`,
      'k8s-interop-be-token-generation-readmodel-checker-errors-att',
    ]) {
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(name), undefined);
      assert.throws(() => alarm.resolveContext(name), /Unsupported INTEROP alarm name/u);
    }
  });

  it('uses the documented 5/1 window and the shared cloud pipeline', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(computeRunbookTimeRange(runbook, { kind: 'single', at: '2026-10-12T10:00:00.000Z' }), {
      startTime: '2026-10-12T09:55:00.000Z',
      endTime: '2026-10-12T10:01:00.000Z',
    });
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        alarm.stepIds.resolveContext,
        alarm.stepIds.queryApplicationLogs,
        alarm.stepIds.analyzeApplicationLogs,
        alarm.stepIds.queryCidTracker,
        alarm.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
  });

  it('recognizes the documented catalog difference without a CID and exposes outstanding follow-up', async () => {
    const { result, draft, queries, logGroups } = await execute({ applicationMessage: MESSAGE });
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.matchedCases[0]?.id, 'async-token-generation-catalog-platform-states-difference');
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(draft.analysisType, 'ANALYZABLE');
    assert.deepStrictEqual(draft.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);

    assert.ok(draft.links.some(({ url }) => url === CONFLUENCE_URL));
    assert.ok(draft.links.some(({ url }) => url === 'https://pagopa.atlassian.net/browse/PIN-10541'));
    assert.ok(draft.links.some(({ url }) => url.endsWith('/p1784019090399849')));
    assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-att/application']);
    assert.strictEqual(queries.length, 1);
    assert.ok(queries[0]?.includes('(log like /ERROR/ or stream = "stderr")'));
    assert.ok(queries[0]?.includes(`pod_app = "${alarm.podApp}"`));
    assert.ok(queries[0]?.includes('@logStream not like /adot-collector/'));
    assert.ok(queries[0]?.includes('sort @timestamp asc'));
    assert.ok(!queries[0]?.includes('@message like /ERROR/'));
    assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
  });

  it('recognizes different valid catalog identifiers in a plain log field', async () => {
    const message = MESSAGE.replace(
      '2d9d036e-7d4a-4634-8506-ea8ed67b291c',
      '11111111-2222-3333-4444-555555555555',
    ).replace('755022d4-cfad-4da9-b188-187c4c4743c9', 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE');
    const { draft } = await execute({ applicationMessage: message, plainLog: true });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
  });

  it('extracts the CID from JSON logs and follows all correlated services and levels', async () => {
    const { result, draft, queries, logGroups } = await execute({
      applicationMessage: MESSAGE,
      cid: '10171933-1d9a-4195-b6ab-dffc491428d5',
      trackerMessage: 'INFO - Request processed',
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.includes('filter cid = "10171933-1d9a-4195-b6ab-dffc491428d5"'));
    assert.ok(!queries[1]?.includes('filter pod_app'));
    assert.ok(!queries[1]?.includes('/ERROR/'));
    assert.deepStrictEqual(logGroups, Array<string>(2).fill('/aws/eks/interop-eks-cluster-att/application'));
    assert.strictEqual(result.finalContext.vars.get(`${alarm.varPrefix}CidCount`), '1');
    assert.strictEqual(result.finalContext.vars.get('interopCidTrackerLogCount'), '1');
  });

  it('does not assign a catalog difference from another service to the checker', async () => {
    const { result, draft } = await execute({
      applicationMessage: 'Unknown checker error',
      cid: 'checker-cid',
      trackerMessage: MESSAGE,
      trackerPodApp: 'interop-be-token-generation-readmodel-checker',
    });
    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
  });

  it('leaves other entities, incomplete keys, invalid suffixes and Jira-only messages unknown', async () => {
    for (const applicationMessage of [
      MESSAGE.replace('ESERVICEDESCRIPTOR', 'AGREEMENT'),
      MESSAGE.slice(0, -1),
      `${MESSAGE}0`,
      `${MESSAGE}-extra`,
      `${MESSAGE}#extra`,
      'Differences in platform-states when checking catalog entry ESERVICEDESCRIPTOR#invalid#invalid',
      'Unexpected producer-keychain-platform-states entry PRODUCERKEYCHAINKIDESERVICE#11111111-2222-3333-4444-555555555555',
    ]) {
      const { result, draft } = await execute({ applicationMessage });
      assert.deepStrictEqual(result.matchedCases, [], applicationMessage);
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT', applicationMessage);
    }
  });

  it('keeps empty evidence unknown and retains the instruction to document new cases', async () => {
    const { result, draft, queries } = await execute({});
    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(queries.length, 1);
    assert.ok(draft.links.some(({ url }) => url === CONFLUENCE_URL));
  });
});
