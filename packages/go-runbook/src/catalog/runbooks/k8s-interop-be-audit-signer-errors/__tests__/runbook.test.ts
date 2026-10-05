import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import type { InteropEnvironment } from '../../interop/InteropEnvironment.js';
import { AUDIT_SIGNER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const UPLOAD_ERROR =
  'Error processing message: Error: Error uploading file content on safe storage, details: AxiosError: Request failed with status code ';
const CREATE_TIMEOUT =
  'Error processing message: Error: Error creating file on safe storage, details: AxiosError: timeout of 30000ms exceeded';

interface Scenario {
  readonly applicationMessage?: string;
  readonly cid?: string;
  readonly trackerMessage?: string;
}

interface TestExecution {
  readonly draft: ReturnType<typeof buildAnalysisDraft>;
  readonly logGroups: ReadonlyArray<string>;
  readonly queries: ReadonlyArray<string>;
  readonly result: RunbookExecutionResult;
}

async function execute(environment: InteropEnvironment, scenario: Scenario): Promise<TestExecution> {
  const logGroups: string[] = [];
  const queries: string[] = [];
  const cloudWatchLogs = {
    async queryWithStatistics(groups: ReadonlyArray<string>, query: string): Promise<AWSCloudWatchLogsQueryResult> {
      await Promise.resolve();
      logGroups.push(...groups);
      queries.push(query);
      const tracker = query.includes('filter cid =');
      const message = tracker ? scenario.trackerMessage : scenario.applicationMessage;
      const podApp = tracker ? 'another-service' : alarm.podApp;
      const cidBlock = scenario.cid === undefined ? '' : `[CID=${scenario.cid}] `;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
        message === undefined
          ? []
          : [
              [
                { field: '@timestamp', value: '2026-10-05 08:00:00.000' },
                { field: 'pod_app', value: podApp },
                {
                  field: '@message',
                  value: JSON.stringify({
                    log: `2026-10-05T08:00:00.000Z ${tracker ? 'INFO' : 'ERROR'} - ${cidBlock}${message}`,
                    pod_app: podApp,
                    stream: tracker ? 'stdout' : 'stderr',
                  }),
                },
              ],
            ];
      return {
        rows,
        statistics: { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 },
        queryExecutions: [],
      };
    },
  };
  const runbook = buildRunbook();
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', `${alarm.runbookKey}-${environment}`],
      ['startTime', '2026-10-05T07:55:00.000Z'],
      ['endTime', '2026-10-05T08:01:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { draft: buildAnalysisDraft(runbook, result), logGroups, queries, result };
}

describe('audit signer runbook', () => {
  it('registers the canonical names and rejects the duplicated errors suffix', () => {
    for (const environment of ['prod', 'att', 'test'] as const) {
      const alarmName = `${alarm.runbookKey}-${environment}`;
      const resolved = RUNBOOK_CATALOG.resolveByAlarmName(alarmName);
      assert.strictEqual(resolved?.descriptor.key, alarm.runbookKey);
      assert.strictEqual(resolved?.product, 'INTEROP');
      assert.strictEqual(resolved?.descriptor.kind, 'K8S');
      assert.strictEqual(alarm.resolveContext(alarmName).podApp, 'interop-be-audit-signer');
      assert.strictEqual(alarm.resolveContext(alarmName).environment, environment);
      assert.strictEqual(RUNBOOK_CATALOG.resolveByAlarmName(`${alarm.runbookKey}-errors-${environment}`), undefined);
    }
    assert.throws(() => alarm.resolveContext(`${alarm.runbookKey}-dev`), /Unsupported INTEROP alarm/u);
  });

  it('provides the source page, occurrence window and read-only cloud policy', () => {
    const runbook = buildRunbook();
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [{ name: alarm.podApp, role: 'PRIMARY' }]);
    assert.strictEqual(
      runbook.analysisDefaults?.links?.[0]?.url,
      'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3130917378/k8s-interop-be-audit-signer-errors',
    );
  });

  for (const status of [500, 503]) {
    it(`recognizes the HTTP ${status} upload case without closing it or requiring a CID`, async () => {
      const { draft, queries, logGroups, result } = await execute('prod', {
        applicationMessage: `${UPLOAD_ERROR}${status}`,
      });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.match(draft.conclusionNotes, /hash/u);
      assert.match(draft.conclusionNotes, /interop-generated-jwt-details-prod-es1/u);
      assert.ok(draft.links.some(({ url }) => url.endsWith('/p1782220704023239')));
      assert.ok(draft.links.some(({ url }) => url.endsWith('/p1784042414414819')));
      assert.deepStrictEqual(draft.downstreams, []);
      assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-prod/application']);
      assert.strictEqual(queries.length, 1);
      assert.ok(queries[0]?.includes('(log like /ERROR/ or stream = "stderr")'));
      assert.ok(queries[0]?.includes('pod_app = "interop-be-audit-signer"'));
      assert.ok(!queries[0]?.includes('@message like /ERROR/'));
      assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
    });
  }

  it('keeps the create timeout open until the retry on the same file is verified', async () => {
    const { draft } = await execute('prod', { applicationMessage: CREATE_TIMEOUT });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.match(draft.conclusionNotes, /stesso file/u);
    assert.match(draft.conclusionNotes, /assenza di CID/u);
    assert.ok(!draft.conclusionNotes.includes('interop-generated-jwt-details-prod-es1'));
  });

  it('extracts CIDs from JSON and collects INFO messages across services', async () => {
    const { draft, result, queries } = await execute('prod', {
      applicationMessage: CREATE_TIMEOUT,
      cid: 'audit-cid',
      trackerMessage: 'Retry successful for another file',
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[1]?.includes('filter cid = "audit-cid"'));
    assert.ok(!queries[1]?.includes('filter pod_app'));
    assert.ok(!queries[1]?.includes('/ERROR/'));
    assert.strictEqual(result.finalContext.vars.get(`${alarm.varPrefix}CidCount`), '1');
    assert.strictEqual(result.finalContext.vars.get('interopCidTrackerLogCount'), '1');
  });

  it('does not treat a generic retry success as proof of content equality', async () => {
    const { draft } = await execute('prod', {
      applicationMessage: `${UPLOAD_ERROR}500`,
      cid: 'audit-cid',
      trackerMessage: 'Retry successful',
    });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.match(draft.conclusionNotes, /confrontare l’hash/u);
  });

  for (const environment of ['test', 'att'] as const) {
    it(`does not extend Prod cases to undocumented ${environment} occurrences`, async () => {
      for (const applicationMessage of [`${UPLOAD_ERROR}500`, CREATE_TIMEOUT]) {
        const { draft, logGroups, result } = await execute(environment, { applicationMessage });
        assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
        assert.strictEqual(result.matchedCases.length, 0);
        assert.deepStrictEqual(logGroups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
      }
    });
  }

  it('does not attribute another service’s tracker error to the signer', async () => {
    const { draft, result } = await execute('prod', {
      applicationMessage: 'Unknown signer error',
      cid: 'audit-cid',
      trackerMessage: `${UPLOAD_ERROR}500`,
    });
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
  });

  it('keeps unrelated HTTP codes, other operations and other timeout durations unclassified', async () => {
    for (const applicationMessage of [
      `${UPLOAD_ERROR}403`,
      `${UPLOAD_ERROR}5000`,
      CREATE_TIMEOUT.replace('30000ms', '60000ms'),
      `${UPLOAD_ERROR}500`.replace('uploading file content', 'creating file'),
    ]) {
      const { draft, result } = await execute('prod', { applicationMessage });
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
      assert.strictEqual(result.matchedCases.length, 0);
    }
  });

  it('preserves an empty scan as unknown without querying the tracker', async () => {
    const { draft, queries, result } = await execute('prod', {});
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
    assert.strictEqual(queries.length, 1);
  });
});
