import { AUTH_SERVER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
  ResultField,
} from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';

import { ConditionEvaluator } from '../../../../core/ConditionEvaluator.js';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import type { RunbookExecutionResult } from '../../../../types/RunbookExecutionResult.js';
import { apigw } from '../../framework.js';

import { buildRunbook } from '../runbook.js';
import { createTestServiceRegistry } from '../../../../services/createTestServiceRegistry.js';

describe('buildRunbook', () => {
  it('builds the read-only APIGW → warnings → CID pipeline with the asymmetric window', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, AUTH_SERVER_ALARM.runbookKey);
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        AUTH_SERVER_ALARM.stepIds.resolveContext,
        AUTH_SERVER_ALARM.stepIds.queryApiGwAggregates,
        AUTH_SERVER_ALARM.stepIds.analyzeApiGwAggregates,
        AUTH_SERVER_ALARM.stepIds.queryApplicationLogs,
        AUTH_SERVER_ALARM.stepIds.analyzeApplicationLogs,
        AUTH_SERVER_ALARM.stepIds.queryCidTracker,
        AUTH_SERVER_ALARM.stepIds.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 2, afterMinutes: 1 });
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(apigw.isApiGwRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.services[0]?.name, AUTH_SERVER_ALARM.serviceName);
    assert.strictEqual(runbook.knownCases.length, 8);
  });

  it('uses X-2/X+1 for APIGW and CID but X-2/X for auth-server warnings', async () => {
    const seen: { readonly query: string; readonly range: AWSCloudWatchLogsTimeRange }[] = [];
    const applicationRows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: 'count', value: '1' },
        { field: 'cid', value: 'cid-1' },
        { field: 'errorMessage', value: 'unclassified warning' },
      ],
    ];
    const cloudWatchLogs = {
      async queryWithStatistics(
        logGroups: ReadonlyArray<string>,
        query: string,
        range: AWSCloudWatchLogsTimeRange,
        _options: AWSCloudWatchLogsQueryOptions,
      ): Promise<AWSCloudWatchLogsQueryResult> {
        seen.push({ query, range });
        await Promise.resolve();
        const rows =
          logGroups[0]?.startsWith('amazon-apigateway') === true
            ? [
                [
                  { field: 'count', value: '1' },
                  { field: 'status', value: '400' },
                ],
              ]
            : query.includes('stats count(*)')
              ? applicationRows
              : [];
        return {
          rows,
          statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
          queryExecutions: [],
        };
      },
    };

    await execute(cloudWatchLogs);

    assert.strictEqual(seen.length, 3);
    assert.strictEqual(seen[0]?.range.end.toISOString(), '2026-08-24T10:01:00.000Z');
    assert.strictEqual(seen[1]?.range.end.toISOString(), '2026-08-24T10:00:00.000Z');
    assert.match(seen[1]?.query ?? '', /pod_app like \/interop\\-be\\-authorization\\-server\//u);
    assert.doesNotMatch(seen[1]?.query ?? '', /authorization\\-server\\-node/u);
    assert.strictEqual(seen[2]?.range.end.toISOString(), '2026-08-24T10:01:00.000Z');
  });

  it('completes the documented API Gateway 403 case without an application warning', async () => {
    const accessRows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: 'latestTimestamp', value: '2026-08-24 10:00:00.000' },
        { field: 'count', value: '2' },
        { field: 'status', value: '403' },
        { field: 'httpMethod', value: 'GET' },
        { field: 'requestPath', value: '/token.oauth2' },
      ],
    ];
    const cloudWatchLogs = {
      async queryWithStatistics(logGroups: ReadonlyArray<string>): Promise<AWSCloudWatchLogsQueryResult> {
        await Promise.resolve();
        const rows = logGroups[0]?.startsWith('amazon-apigateway') === true ? accessRows : [];
        return {
          rows,
          statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
          queryExecutions: [],
        };
      },
    };

    const result = await execute(cloudWatchLogs);
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['auth-server-api-gateway-forbidden-403'],
    );
    const draft = buildAnalysisDraft(buildRunbook(), result);
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'COMPLETED');
    assert.match(draft.conclusionNotes, /nessuna azione necessaria/u);
  });
});

async function execute(cloudWatchLogs: unknown): Promise<RunbookExecutionResult> {
  const runbook = buildRunbook();
  const engine = new RunbookEngine(new GOLogger(), new ConditionEvaluator());
  return engine.execute(
    runbook,
    new Map([
      ['alarmName', 'interop-auth-server-prod-apigw-4xx'],
      ['alarmDatetime', '2026-08-24T10:00:00.000Z'],
      ['startTime', '2026-08-24T09:58:00.000Z'],
      ['endTime', '2026-08-24T10:01:00.000Z'],
    ]),
    createTestServiceRegistry({ cloudWatchLogs }),
  );
}
