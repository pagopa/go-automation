import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';

import { computeRunbookTimeRange } from '../../../computeRunbookTimeRange.js';
import { service } from '../../framework.js';
import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { assertAnalysisAnnotations } from '../../../../validation/assertAnalysisAnnotations.js';
import { EXTERNAL_REGISTRIES_IO_ALARM } from '../alarmDefinition.js';
import { SERVICE } from '../knownServices.js';
import { buildRunbook } from '../runbook.js';

const TRACE_ID = '1-69bd2170-e25ad8375848680f6a33bd33';

describe('external-registries IO downstream runbook', () => {
  it('builds the canonical read-only SERVICE pipeline with valid analysis annotations', () => {
    const runbook = buildRunbook();
    assert.strictEqual(runbook.metadata.id, EXTERNAL_REGISTRIES_IO_ALARM);
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        'prepare-service-section',
        'query-pn-external-registries',
        'analyze-pn-external-registries',
        'query-pn-external-registries-trace',
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.ok(service.isServiceRunbookContext(runbook.runbookContext));
    assert.deepStrictEqual(runbook.runbookContext.service, SERVICE);
    assert.strictEqual(runbook.runbookContext.queryProfileId, 'send-service');
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.doesNotThrow(() => assertAnalysisAnnotations(runbook, 'SEND'));
  });

  it('preserves the ERROR/message predicates and the canonical downstream projection', () => {
    assert.strictEqual(SERVICE.logGroup, '/aws/ecs/pn-external-registries');
    assert.strictEqual(
      SERVICE.queryOverride,
      `filter level = 'ERROR' and message like '[DOWNSTREAM] Service IO returned errors='\n| ${service.buildDownstreamDetectionQuery({ downstreamName: 'IO' })}`,
    );
    assert.match(SERVICE.queryOverride ?? '', /fields[^\n]*trace_id[^\n]*message/u);
    assert.doesNotMatch(SERVICE.queryOverride ?? '', /not like|OneTrust|AppIO/u);
  });

  it('covers all six five-minute evaluation periods without treating them as a recovery timer', () => {
    const runbook = buildRunbook();
    assert.deepStrictEqual(runbook.occurrenceTimeWindow, { beforeMinutes: 30, afterMinutes: 5 });
    assert.deepStrictEqual(computeRunbookTimeRange(runbook, { kind: 'single', at: '2026-09-07T10:00:00.000Z' }), {
      startTime: '2026-09-07T09:30:00.000Z',
      endTime: '2026-09-07T10:05:00.000Z',
    });
  });

  it('includes the source document and the primary resource', () => {
    const runbook = buildRunbook();
    assert.deepStrictEqual(runbook.analysisDefaults, {
      runbookName: EXTERNAL_REGISTRIES_IO_ALARM,
      resources: [{ name: 'pn-external-registries', role: 'PRIMARY' }],
      links: [
        {
          url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3312976074/pn-external-registries-IO-downstream-detection-Alarm',
          name: EXTERNAL_REGISTRIES_IO_ALARM,
          type: 'CONFLUENCE',
        },
      ],
    });
  });

  it('runs q2 for an unknown error carrying a trace, then uses the standard fallback', async () => {
    const queries: string[] = [];
    const runbook = buildRunbook();
    const services = createTestServiceRegistry({
      cloudWatchLogs: {
        async query(
          logGroups: ReadonlyArray<string>,
          query: string,
        ): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
          assert.deepStrictEqual(logGroups, ['/aws/ecs/pn-external-registries']);
          queries.push(query);
          return Promise.resolve(
            queries.length === 1
              ? [
                  [
                    { field: 'level', value: 'ERROR' },
                    { field: 'message', value: '[DOWNSTREAM] Service IO returned errors=429 Too Many Requests' },
                    { field: 'trace_id', value: TRACE_ID },
                  ],
                ]
              : [],
          );
        },
      },
    });
    const result = await new RunbookEngine(new GOLogger()).execute(
      runbook,
      new Map([
        ['startTime', '2026-09-07T09:30:00.000Z'],
        ['endTime', '2026-09-07T10:05:00.000Z'],
      ]),
      services,
    );

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.stepsExecuted, 4);
    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(queries.length, 2);
    assert.strictEqual(queries[0], SERVICE.queryOverride);
    assert.ok(queries[1]?.includes(`filter @message like '${TRACE_ID}'`));
    assert.match(queries[1] ?? '', /sort @timestamp asc/u);
  });

  it('keeps standard early resolution for a known timeout without claiming recovery', async () => {
    let calls = 0;
    const services = createTestServiceRegistry({
      cloudWatchLogs: {
        async query(): Promise<ReadonlyArray<ReadonlyArray<ResultField>>> {
          calls += 1;
          return Promise.resolve([
            [
              { field: 'level', value: 'ERROR' },
              {
                field: 'message',
                value: '[DOWNSTREAM] Service IO returned errors=io.netty.handler.timeout.ReadTimeoutException',
              },
              { field: 'trace_id', value: TRACE_ID },
            ],
          ]);
        },
      },
    });
    const result = await new RunbookEngine(new GOLogger()).execute(
      buildRunbook(),
      new Map([
        ['startTime', '2026-09-07T09:30:00.000Z'],
        ['endTime', '2026-09-07T10:05:00.000Z'],
      ]),
      services,
    );

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.stepsExecuted, 3);
    assert.strictEqual(calls, 1);
    assert.strictEqual(result.matchedCases[0]?.id, 'io-read-timeout');
    assert.strictEqual(result.matchedCases[0]?.analysis?.proposedStatus, 'IN_PROGRESS');
  });
});
