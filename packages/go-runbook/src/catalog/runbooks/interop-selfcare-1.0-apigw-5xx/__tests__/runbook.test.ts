import { STEP_IDS } from '../resolveInteropAlarmContext.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsQueryResult, ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';

import { apigw } from '../../framework.js';
import { ConditionEvaluator } from '../../../../core/ConditionEvaluator.js';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { buildAnalysisDraft } from '../../../../output/buildAnalysisDraft.js';
import type { ServiceRegistry } from '../../../../services/ServiceRegistry.js';

import { buildInteropSelfcareApiGw5xxRunbook } from '../runbook.js';
import {
  INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
  INTEROP_SELFCARE_API_GW_SERVICE_NAME,
} from '../resolveInteropAlarmContext.js';

describe('buildInteropSelfcareApiGw5xxRunbook', () => {
  it('builds the custom read-only APIGW → BFF → CID pipeline', () => {
    const runbook = buildInteropSelfcareApiGw5xxRunbook();

    assert.strictEqual(runbook.metadata.id, INTEROP_SELFCARE_API_GW_RUNBOOK_KEY);
    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      [
        STEP_IDS.resolveContext,
        STEP_IDS.queryApiGwAggregates,
        STEP_IDS.analyzeApiGwAggregates,
        STEP_IDS.queryApplicationLogs,
        STEP_IDS.analyzeApplicationLogs,
        STEP_IDS.queryCidTracker,
        STEP_IDS.analyzeCidTracker,
      ],
    );
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 5, afterMinutes: 1 });
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(apigw.isApiGwRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.services[0]?.name, INTEROP_SELFCARE_API_GW_SERVICE_NAME);
    assert.ok(runbook.knownCases.length >= 20);
  });

  it('matches an API Gateway-only timeout and exposes it as output evidence', async () => {
    const accessRows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: 'latestTimestamp', value: '2026-08-24 09:10:00.000' },
        { field: 'count', value: '1' },
        { field: 'status', value: '504' },
        { field: 'integrationError', value: 'Execution failed due to a timeout error' },
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
    const runbook = buildInteropSelfcareApiGw5xxRunbook();
    const engine = new RunbookEngine(new GOLogger(), new ConditionEvaluator());
    const result = await engine.execute(
      runbook,
      new Map([
        ['alarmName', 'interop-selfcare-1.0-prod-apigw-5xx'],
        ['startTime', '2026-08-24T09:05:11.000Z'],
        ['endTime', '2026-08-24T09:11:11.000Z'],
      ]),
      { cloudWatchLogs } as unknown as ServiceRegistry,
    );

    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['api-gateway-backend-timeout-504'],
    );
    const output = apigw.buildApiGwOutputContext(runbook, result);
    assert.ok(output !== undefined);
    assert.match(JSON.stringify(output.evidence), /Execution failed due to a timeout error/u);
  });

  it('keeps an actionable IAM failure primary when a benign SelfcareID suppression also matches', async () => {
    const accessRows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: 'latestTimestamp', value: '2026-08-24 09:10:00.000' },
        { field: 'count', value: '1' },
        { field: 'status', value: '500' },
        { field: 'httpMethod', value: 'GET' },
        { field: 'requestPath', value: '/1.0/backend-for-frontend/catalog' },
      ],
    ];
    const applicationRows: ReadonlyArray<ReadonlyArray<ResultField>> = [
      [
        { field: '@timestamp', value: '2026-08-24 09:09:30.000' },
        { field: 'pod_app', value: 'interop-be-backend-for-frontend' },
        { field: 'cid', value: 'iam-cid' },
        {
          field: '@message',
          value:
            '[CID=iam-cid] User arn:aws:iam::123:role/bff is not authorized to perform: s3:ListBucket ' +
            'because no identity-based policy allows the s3:ListBucket action',
        },
      ],
      [
        { field: '@timestamp', value: '2026-08-24 09:09:40.000' },
        { field: 'pod_app', value: 'interop-be-backend-for-frontend' },
        { field: 'cid', value: 'selfcare-cid' },
        {
          field: '@message',
          value: '[CID=selfcare-cid] Tenant with selfcareId 56f4f576-af5e-4a90-8be2-1ac78dec899f not found',
        },
      ],
    ];
    const cloudWatchLogs = {
      async queryWithStatistics(logGroups: ReadonlyArray<string>): Promise<AWSCloudWatchLogsQueryResult> {
        await Promise.resolve();
        const rows = logGroups[0]?.startsWith('amazon-apigateway') === true ? accessRows : applicationRows;
        return {
          rows,
          statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
          queryExecutions: [],
        };
      },
    };
    const runbook = buildInteropSelfcareApiGw5xxRunbook();
    const engine = new RunbookEngine(new GOLogger(), new ConditionEvaluator());
    const result = await engine.execute(
      runbook,
      new Map([
        ['alarmName', 'interop-selfcare-1.0-prod-apigw-5xx'],
        ['startTime', '2026-08-24T09:05:11.000Z'],
        ['endTime', '2026-08-24T09:11:11.000Z'],
      ]),
      { cloudWatchLogs } as unknown as ServiceRegistry,
    );

    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['bff-s3-list-bucket-not-authorized', 'tenant-not-found-known-selfcare-id'],
    );
    const draft = buildAnalysisDraft(runbook, result);
    assert.strictEqual(draft?.kind, 'KNOWN_CASE');
    assert.strictEqual(draft.proposedStatus, 'IN_PROGRESS');
    assert.match(draft.conclusionNotes, /permessi infrastrutturali/u);
  });
});
