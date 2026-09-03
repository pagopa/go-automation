import { AUTH_SERVER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('AUTH_SERVER_ALARM.resolveContext', () => {
  it('resolves every standard and low-request alarm to the documented API Gateway', () => {
    const expectedIds = { prod: 'ffmbmcmreh', att: '70ar087an0', test: 'q9ocrukty2' } as const;

    for (const alarmName of AUTH_SERVER_ALARM.alarmNames) {
      const context = AUTH_SERVER_ALARM.resolveContext(alarmName);
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
    assert.deepStrictEqual(AUTH_SERVER_ALARM.alarmNames, [
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
      assert.throws(() => AUTH_SERVER_ALARM.resolveContext(alarmName), /Unsupported INTEROP alarm name/u);
    }
  });
});
