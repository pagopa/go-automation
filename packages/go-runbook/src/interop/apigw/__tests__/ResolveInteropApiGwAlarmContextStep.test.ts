import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import { ResolveInteropApiGwAlarmContextStep } from '../steps/ResolveInteropApiGwAlarmContextStep.js';

function context(alarmName?: string): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-24T10:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(alarmName === undefined ? [] : [['alarmName', alarmName]]),
    logs: [],
    services: {} as ServiceRegistry,
    recoveredErrors: [],
  };
}

function step(): ResolveInteropApiGwAlarmContextStep {
  return new ResolveInteropApiGwAlarmContextStep({
    id: 'resolve',
    label: 'Resolve',
    resolverId: 'fixture-resolver',
    resolveAlarmContext: (alarmName) => ({
      alarmName,
      runbookKey: 'fixture',
      environment: 'prod',
      apiGwId: 'api-id',
      apiGwLogGroup: 'access-logs',
      podApp: 'service',
      applicationLogGroup: 'application-logs',
    }),
  });
}

describe('ResolveInteropApiGwAlarmContextStep', () => {
  it('exposes the canonical INTEROP runtime variables', async () => {
    const result = await step().execute(context('fixture-prod'));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['interopEnvironment'], 'prod');
    assert.strictEqual(result.vars?.['interopApiGwId'], 'api-id');
    assert.strictEqual(result.vars?.['interopPodApp'], 'service');
  });

  it('requires alarmName and reports resolver metadata', async () => {
    const missing = await step().execute(context());
    assert.strictEqual(missing.success, false);
    assert.deepStrictEqual(step().getTraceInfo(context('fixture-prod')), {
      alarmName: 'fixture-prod',
      resolver: 'fixture-resolver',
    });
  });
});
