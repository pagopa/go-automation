import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';

import { createServiceAlarmRunbook } from '../createServiceAlarmRunbook.js';
import type { ServiceAlarmConfig } from '../../types/ServiceAlarmConfig.js';
import { isServiceRunbookContext } from '../../output/ServiceRunbookContext.js';
import { buildServiceOutputContext } from '../../output/buildServiceOutputContext.js';
import type { RunbookExecutionResult } from '../../../types/RunbookExecutionResult.js';
import type { RunbookExecutionTrace } from '../../../trace/RunbookExecutionTrace.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';

function baseConfig(overrides: Partial<ServiceAlarmConfig> = {}): ServiceAlarmConfig {
  return {
    id: 'service-alarm',
    metadata: {
      name: 'Service alarm',
      description: 'desc',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: ['service'],
    },
    service: {
      name: 'pn-service',
      logGroup: '/aws/ecs/pn-service',
      varPrefix: 'pnService',
    },
    knownCases: [],
    ...overrides,
  };
}

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function fakeResult(): RunbookExecutionResult {
  const vars = new Map<string, string>([
    ['pnServiceLogCount', '1'],
    ['pnServiceTraceId', '1-abcdef12-1234567890abcdef12345678'],
    ['pnServiceTraceLogCount', '2'],
    ['pnServiceErrorMsg', 'boom'],
  ]);

  return {
    runbookId: 'service-alarm',
    status: 'completed',
    matchedCases: [],
    durationMs: 1,
    stepsExecuted: 3,
    finalContext: {
      executionId: 'x',
      startedAt: new Date('2026-06-09T00:00:00.000Z'),
      stepResults: new Map<string, unknown>([
        ['query-pn-service', [row({ '@timestamp': '2026-06-09T00:00:00.000Z', '@message': 'boom' })]],
        [
          'query-pn-service-trace',
          [
            row({ '@timestamp': '2026-06-09T00:00:01.000Z', '@message': 'context 1' }),
            row({ '@timestamp': '2026-06-09T00:00:02.000Z', '@message': 'context 2' }),
          ],
        ],
      ]),
      vars,
      params: new Map<string, string>([
        ['alarmName', 'service-alarm'],
        ['alarmDatetime', '2026-06-09T00:00:00.000Z'],
        ['startTime', '2026-06-08T23:55:00.000Z'],
        ['endTime', '2026-06-09T00:05:00.000Z'],
      ]),
      logs: [],
      services: {} as unknown as ServiceRegistry,
      recoveredErrors: [],
    },
    recoveredErrors: [],
    trace: {
      execution: {
        executionId: 'x',
        startedAt: '2026-06-09T00:00:00.000Z',
        completedAt: '2026-06-09T00:00:01.000Z',
        durationMs: 1,
        status: 'completed',
        environment: { awsProfiles: [], region: 'eu-south-1', invokedBy: 'manual' },
      },
      input: {},
      pipeline: [],
      caseMatching: { casesEvaluated: 0, matchedCases: [], evaluations: [] },
      earlyResolutions: [],
      actionsExecuted: [],
      summary: { status: 'completed', stepsExecuted: 3, outcome: '', description: '' },
    } as unknown as RunbookExecutionTrace,
  };
}

describe('createServiceAlarmRunbook', () => {
  it('builds the canonical service-log pipeline', () => {
    const runbook = createServiceAlarmRunbook(baseConfig());

    assert.deepStrictEqual(
      runbook.steps.map((descriptor) => descriptor.step.id),
      ['prepare-service-section', 'query-pn-service', 'analyze-pn-service', 'query-pn-service-trace'],
    );
  });

  it('exposes service runbookContext for output builders', () => {
    const runbook = createServiceAlarmRunbook(baseConfig());

    assert.ok(isServiceRunbookContext(runbook.runbookContext));
    assert.strictEqual(runbook.runbookContext.service.name, 'pn-service');
    assert.strictEqual(runbook.runbookContext.queryProfileId, 'send-service');
  });

  it('marks generated service steps as silent', () => {
    const runbook = createServiceAlarmRunbook(baseConfig());

    for (const descriptor of runbook.steps) {
      assert.strictEqual(descriptor.silent, true, `step ${descriptor.step.id} should be silent`);
    }
  });

  it('builds a structured service output context', () => {
    const runbook = createServiceAlarmRunbook(baseConfig());
    const context = buildServiceOutputContext(runbook, fakeResult());

    assert.ok(context !== undefined);
    assert.strictEqual(
      context.fields.find((field) => field.name === 'traceId')?.value,
      '1-abcdef12-1234567890abcdef12345678',
    );
    assert.strictEqual(context.evidence.length, 2);
  });

  it('rejects a service.name that is not a slug (would break step ids)', () => {
    assert.throws(
      () =>
        createServiceAlarmRunbook(
          baseConfig({ service: { name: 'pn service', logGroup: '/aws/ecs/pn-service', varPrefix: 'pnService' } }),
        ),
      /service\.name .* must be a slug/,
    );
  });

  it('rejects a service.varPrefix that is not a valid identifier', () => {
    assert.throws(
      () =>
        createServiceAlarmRunbook(
          baseConfig({ service: { name: 'pn-service', logGroup: '/aws/ecs/pn-service', varPrefix: '1bad prefix' } }),
        ),
      /service\.varPrefix/,
    );
  });
});
