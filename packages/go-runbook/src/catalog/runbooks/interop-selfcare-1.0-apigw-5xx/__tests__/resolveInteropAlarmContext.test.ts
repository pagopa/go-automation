import { SELFCARE_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('SELFCARE_ALARM.resolveContext', () => {
  it('resolves every supported environment with the API Gateway ids declared by the query section', () => {
    const expectedIds = new Map([
      ['prod', 'tf9isbi4pi'],
      ['att', '5sfghk09qb'],
      ['test', 'an24tfmqw3'],
    ]);

    for (const alarmName of SELFCARE_ALARM.alarmNames) {
      const context = SELFCARE_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.runbookKey, SELFCARE_ALARM.runbookKey);
      assert.strictEqual(context.podApp, SELFCARE_ALARM.serviceName);
      assert.strictEqual(context.apiGwId, expectedIds.get(context.environment));
      assert.strictEqual(context.apiGwLogGroup, `amazon-apigateway-interop-access-logs-${context.environment}`);
      assert.strictEqual(
        context.applicationLogGroup,
        `/aws/eks/interop-eks-cluster-${context.environment}/application`,
      );
    }
  });

  it('rejects names outside the three registered aliases', () => {
    assert.throws(
      () => SELFCARE_ALARM.resolveContext('interop-selfcare-1.0-dev-apigw-5xx'),
      /Unsupported INTEROP alarm name/u,
    );
    assert.throws(() => SELFCARE_ALARM.resolveContext(SELFCARE_ALARM.runbookKey), /Unsupported INTEROP alarm name/u);
  });
});
