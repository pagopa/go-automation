import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTEROP_AUTH_SERVER_API_GW_ALARM_NAMES,
  resolveInteropAuthServerApiGwAlarmContext,
} from '../resolveInteropAlarmContext.js';

describe('resolveInteropAuthServerApiGwAlarmContext', () => {
  it('resolves every standard and low-request alarm to the documented API Gateway', () => {
    const expectedIds = { prod: 'ffmbmcmreh', att: '70ar087an0', test: 'q9ocrukty2' } as const;

    for (const alarmName of INTEROP_AUTH_SERVER_API_GW_ALARM_NAMES) {
      const context = resolveInteropAuthServerApiGwAlarmContext(alarmName);
      assert.strictEqual(context.apiGwId, expectedIds[context.environment]);
      assert.strictEqual(context.apiGwLogGroup, `amazon-apigateway-interop-access-logs-${context.environment}`);
      assert.strictEqual(
        context.applicationLogGroup,
        `/aws/eks/interop-eks-cluster-${context.environment}/application`,
      );
      assert.strictEqual(context.podApp, 'interop-be-authorization-server-node');
    }
  });

  it('registers exactly the five alarms observed in Watchtower', () => {
    assert.deepStrictEqual(INTEROP_AUTH_SERVER_API_GW_ALARM_NAMES, [
      'interop-auth-server-prod-apigw-4xx',
      'interop-auth-server-att-apigw-4xx',
      'interop-auth-server-test-apigw-4xx',
      'interop-auth-server-att-apigw-4xx-low-requests',
      'interop-auth-server-test-apigw-4xx-low-requests',
    ]);
  });

  it('rejects unsupported aliases instead of guessing an API Gateway id', () => {
    for (const alarmName of [
      'interop-auth-server-prod-apigw-4xx-low-requests',
      'interop-auth-server-coll-apigw-4xx',
      'interop-auth-server-catalog-apigw-4xx',
    ]) {
      assert.throws(() => resolveInteropAuthServerApiGwAlarmContext(alarmName), /Unsupported INTEROP alarm name/u);
    }
  });
});
