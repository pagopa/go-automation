import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineInteropApiGwAlarm } from '../defineInteropApiGwAlarm.js';

const SPEC = {
  runbookKey: 'interop-example-apigw-4xx',
  serviceName: 'interop-be-example',
  varPrefix: 'interopExample',
  apiGwProfileId: 'interop-api-gateway-example-4xx',
  apiGwIds: { prod: 'p', att: 'a', test: 't' },
  alarmName: (environment: string) => `interop-example-${environment}-apigw-4xx`,
} as const;

describe('defineInteropApiGwAlarm', () => {
  it('lists one alarm per environment, then the additional ones', () => {
    const alarm = defineInteropApiGwAlarm({
      ...SPEC,
      additionalAlarms: [{ name: 'interop-example-att-apigw-4xx-low-requests', environment: 'att' }],
    });
    assert.deepEqual(alarm.alarmNames, [
      'interop-example-prod-apigw-4xx',
      'interop-example-att-apigw-4xx',
      'interop-example-test-apigw-4xx',
      'interop-example-att-apigw-4xx-low-requests',
    ]);
    assert.equal('podAppFilter' in alarm, false);
  });

  it('resolves the environment, the API Gateway and the log groups of a fired alarm', () => {
    const alarm = defineInteropApiGwAlarm({
      ...SPEC,
      podAppFilter: 'interop-be-ex',
      additionalAlarms: [{ name: 'interop-example-att-apigw-4xx-low-requests', environment: 'att' }],
    });
    assert.equal(alarm.podAppFilter, 'interop-be-ex');
    assert.deepEqual(alarm.resolveContext('interop-example-att-apigw-4xx-low-requests'), {
      alarmName: 'interop-example-att-apigw-4xx-low-requests',
      runbookKey: SPEC.runbookKey,
      environment: 'att',
      apiGwId: 'a',
      apiGwLogGroup: 'amazon-apigateway-interop-access-logs-att',
      podApp: SPEC.serviceName,
      applicationLogGroup: '/aws/eks/interop-eks-cluster-att/application',
    });
  });

  it('rejects a name outside the list, even when it looks like a sibling', () => {
    const alarm = defineInteropApiGwAlarm(SPEC);
    assert.throws(
      () => alarm.resolveContext('interop-example-prod-apigw-4xx-low-requests'),
      /Unsupported INTEROP alarm name .*Expected one of: interop-example-att-apigw-4xx, /u,
    );
  });
});
