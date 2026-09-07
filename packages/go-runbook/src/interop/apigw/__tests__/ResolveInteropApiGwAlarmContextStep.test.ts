import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ResolveInteropApiGwAlarmContextFn } from '../types/InteropApiGwAlarmContext.js';
import { ResolveInteropApiGwAlarmContextStep } from '../steps/ResolveInteropApiGwAlarmContextStep.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';

function context(alarmName?: string): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-24T10:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(alarmName === undefined ? [] : [['alarmName', alarmName]]),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

const RESOLVE_FIXTURE: ResolveInteropApiGwAlarmContextFn = (alarmName) => ({
  alarmName,
  runbookKey: 'fixture',
  environment: 'prod',
  apiGwId: 'api-id',
  apiGwLogGroup: 'access-logs',
  podApp: 'service',
  applicationLogGroup: 'application-logs',
});

function step(
  resolveAlarmContext: ResolveInteropApiGwAlarmContextFn = RESOLVE_FIXTURE,
): ResolveInteropApiGwAlarmContextStep {
  return new ResolveInteropApiGwAlarmContextStep({
    id: 'resolve',
    label: 'Resolve',
    resolverId: 'fixture-resolver',
    resolveAlarmContext,
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

  it('returns a failed step result when the resolver throws', async () => {
    const result = await step(() => {
      throw new Error('unsupported fixture alarm');
    }).execute(context('fixture-unsupported'));

    assert.deepStrictEqual(result, {
      success: false,
      error: 'INTEROP API Gateway alarm context resolution failed (fixture-resolver): unsupported fixture alarm',
    });
  });
});
