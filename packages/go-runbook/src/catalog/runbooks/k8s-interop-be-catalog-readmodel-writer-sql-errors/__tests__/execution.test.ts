import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { INTEROP_DOWNSTREAMS } from '../../framework.js';
import type { InteropEnvironment } from '../../interop/InteropEnvironment.js';
import { CATALOG_READMODEL_WRITER_SQL_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const NETWORK_TIMEOUT = 'ERROR - Connection timeout';
const NETWORK_TLS =
  'ERROR -  Connection error: Client network socket disconnected before secure TLS connection was established';
const KAFKA_REJOIN =
  'ERROR - The coordinator is not aware of this member, re-joining the group - The coordinator is not aware of this member';

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
      const podApp = tracker ? 'interop-be-attribute-registry-readmodel-writer-sql' : alarm.podApp;
      const cidBlock = scenario.cid === undefined ? '' : `[CID=${scenario.cid}] `;
      const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
        message === undefined
          ? []
          : [
              [
                { field: '@timestamp', value: '2026-09-30 10:00:00.000' },
                { field: 'pod_app', value: podApp },
                {
                  field: '@message',
                  value: JSON.stringify({
                    log: `${cidBlock}2026-09-30T10:00:00.000Z ${message}`,
                    pod_app: podApp,
                    pod_namespace: environment,
                    stream: tracker ? 'stdout' : 'stderr',
                  }),
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
  const result = await new RunbookEngine(new GOLogger()).execute(
    runbook,
    new Map([
      ['alarmName', `${alarm.runbookKey}-${environment}`],
      ['startTime', '2026-09-30T09:55:00.000Z'],
      ['endTime', '2026-09-30T10:01:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
  return { draft: buildAnalysisDraft(runbook, result), logGroups, queries, result };
}

describe('catalog readmodel writer SQL execution', () => {
  for (const [stage, applicationMessage] of [
    ['network timeout', NETWORK_TIMEOUT],
    ['network TLS error', NETWORK_TLS],
    ['Kafka rejoin', KAFKA_REJOIN],
  ] as const) {
    it(`recognizes the documented ${stage} in Prod without requiring a CID or closing the case`, async () => {
      const { draft, queries, logGroups, result } = await execute('prod', { applicationMessage });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.deepStrictEqual(draft.downstreams, [INTEROP_DOWNSTREAMS.NESSUNO]);
      assert.match(draft.conclusionNotes, /in loro assenza cercare per pod e intervallo temporale/u);
      assert.deepStrictEqual(logGroups, ['/aws/eks/interop-eks-cluster-prod/application']);
      assert.strictEqual(queries.length, 1);
      assert.ok(queries[0]?.includes('(log like /ERROR/ or stream = "stderr")'));
      assert.ok(queries[0]?.includes('pod_app = "interop-be-catalog-readmodel-writer-sql"'));
      assert.ok(queries[0]?.includes('@logStream not like /adot-collector/'));
      assert.ok(!queries[0]?.includes('@message like /ERROR/'));
      assert.strictEqual(result.finalContext.vars.get('interopCidTrackerExecuted'), 'false');
    });
  }

  it('keeps the Kafka cause, service association and recovery open for verification', async () => {
    const { draft } = await execute('prod', { applicationMessage: KAFKA_REJOIN });
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.match(draft.conclusionNotes, /elaborazione lenta/u);
    assert.match(draft.conclusionNotes, /20 commenti consultati non citano/u);
    assert.match(draft.conclusionNotes, /il tentativo di rejoin non prova il recupero/u);
    assert.ok(draft.links.some(({ url }) => url === 'https://pagopa.atlassian.net/browse/PIN-7325'));
  });

  it('does not extend the Prod cases to Att or Test', async () => {
    for (const environment of ['test', 'att'] as const) {
      for (const applicationMessage of [NETWORK_TIMEOUT, NETWORK_TLS, KAFKA_REJOIN]) {
        const { draft, result, logGroups } = await execute(environment, { applicationMessage });
        assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
        assert.strictEqual(result.matchedCases.length, 0);
        assert.deepStrictEqual(logGroups, [`/aws/eks/interop-eks-cluster-${environment}/application`]);
      }
    }
  });

  it('extracts JSON CIDs and collects correlated INFO across services without declaring recovery', async () => {
    for (const applicationMessage of [NETWORK_TIMEOUT, KAFKA_REJOIN]) {
      const { draft, queries, result } = await execute('prod', {
        applicationMessage,
        cid: 'catalog-cid',
        trackerMessage: 'INFO - Correlated processing resumed',
      });
      assert.strictEqual(draft?.kind, 'KNOWN_CASE');
      assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(queries.length, 2);
      assert.ok(queries[1]?.includes('filter cid = "catalog-cid"'));
      assert.ok(!queries[1]?.includes('filter pod_app'));
      assert.ok(!queries[1]?.includes('/ERROR/'));
      assert.strictEqual(queries[1]?.split('sort @timestamp asc').length, 2);
      assert.strictEqual(result.finalContext.vars.get(`${alarm.varPrefix}CidCount`), '1');
      assert.strictEqual(result.finalContext.vars.get('interopCidTrackerLogCount'), '1');
    }
  });

  it('does not attribute another SQL writer’s tracker errors to catalog', async () => {
    for (const trackerMessage of [NETWORK_TIMEOUT, NETWORK_TLS, KAFKA_REJOIN]) {
      const { draft, result } = await execute('prod', {
        applicationMessage: 'ERROR - Unknown catalog writer error',
        cid: 'catalog-cid',
        trackerMessage,
      });
      assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
      assert.strictEqual(result.matchedCases.length, 0);
    }
  });

  it('keeps empty evidence unknown and skips the CID tracker', async () => {
    const { draft, queries, result } = await execute('prod', {});
    assert.strictEqual(draft?.kind, 'UNKNOWN_CASE_CONTEXT');
    assert.strictEqual(result.matchedCases.length, 0);
    assert.strictEqual(queries.length, 1);
  });
});
