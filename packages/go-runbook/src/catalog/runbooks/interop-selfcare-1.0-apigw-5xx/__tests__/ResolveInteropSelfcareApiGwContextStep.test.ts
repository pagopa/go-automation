import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ServiceRegistry } from '../../../../services/ServiceRegistry.js';
import type { RunbookContext } from '../../../../types/RunbookContext.js';

import { ResolveInteropSelfcareApiGwContextStep } from '../ResolveInteropSelfcareApiGwContextStep.js';

const PROD_ALARM_NAME = 'interop-selfcare-1.0-prod-apigw-5xx';

function context(params: ReadonlyArray<readonly [string, string]>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-24T09:10:11.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(params),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function step(): ResolveInteropSelfcareApiGwContextStep {
  return new ResolveInteropSelfcareApiGwContextStep({
    id: 'resolve-interop-selfcare-api-gw-context',
    label: 'Risoluzione contesto allarme INTEROP Selfcare API Gateway',
  });
}

describe('ResolveInteropSelfcareApiGwContextStep', () => {
  it('resolves the alarm context and exposes every runtime variable', async () => {
    const result = await step().execute(context([['alarmName', PROD_ALARM_NAME]]));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, {
      alarmName: PROD_ALARM_NAME,
      runbookKey: 'interop-selfcare-1.0-apigw-5xx',
      environment: 'prod',
      apiGwId: 'tf9isbi4pi',
      apiGwLogGroup: 'amazon-apigateway-interop-access-logs-prod',
      podApp: 'interop-be-backend-for-frontend',
      applicationLogGroup: '/aws/eks/interop-eks-cluster-prod/application',
    });
    assert.deepStrictEqual(result.vars, {
      interopEnvironment: 'prod',
      interopApiGwId: 'tf9isbi4pi',
      interopApiGwLogGroup: 'amazon-apigateway-interop-access-logs-prod',
      interopPodApp: 'interop-be-backend-for-frontend',
      interopLogGroup: '/aws/eks/interop-eks-cluster-prod/application',
      interopRunbookKey: 'interop-selfcare-1.0-apigw-5xx',
    });
  });

  it('fails when alarmName is missing or blank', async () => {
    const missing = await step().execute(context([]));
    assert.strictEqual(missing.success, false);
    assert.match(missing.error ?? '', /alarmName/u);

    const blank = await step().execute(context([['alarmName', '   ']]));
    assert.strictEqual(blank.success, false);
    assert.match(blank.error ?? '', /alarmName/u);
  });

  it('reports the alarm name and resolver in trace metadata', () => {
    assert.deepStrictEqual(step().getTraceInfo(context([['alarmName', PROD_ALARM_NAME]])), {
      alarmName: PROD_ALARM_NAME,
      resolver: 'interop-selfcare-api-gateway-context',
    });
    assert.deepStrictEqual(step().getTraceInfo(context([])), {
      alarmName: null,
      resolver: 'interop-selfcare-api-gateway-context',
    });
  });
});
