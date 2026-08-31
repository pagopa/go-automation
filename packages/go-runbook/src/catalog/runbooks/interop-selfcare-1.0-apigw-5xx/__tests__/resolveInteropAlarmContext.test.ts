import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTEROP_SELFCARE_API_GW_ALARM_NAMES,
  INTEROP_SELFCARE_API_GW_RUNBOOK_KEY,
  INTEROP_SELFCARE_API_GW_SERVICE_NAME,
  resolveInteropSelfcareApiGwAlarmContext,
} from '../resolveInteropAlarmContext.js';

describe('resolveInteropSelfcareApiGwAlarmContext', () => {
  it('resolves every supported environment with the API Gateway ids declared by the query section', () => {
    const expectedIds = new Map([
      ['prod', 'tf9isbi4pi'],
      ['att', '5sfghk09qb'],
      ['test', 'an24tfmqw3'],
    ]);

    for (const alarmName of INTEROP_SELFCARE_API_GW_ALARM_NAMES) {
      const context = resolveInteropSelfcareApiGwAlarmContext(alarmName);
      assert.strictEqual(context.runbookKey, INTEROP_SELFCARE_API_GW_RUNBOOK_KEY);
      assert.strictEqual(context.podApp, INTEROP_SELFCARE_API_GW_SERVICE_NAME);
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
      () => resolveInteropSelfcareApiGwAlarmContext('interop-selfcare-1.0-dev-apigw-5xx'),
      /Unsupported INTEROP alarm name/u,
    );
    assert.throws(
      () => resolveInteropSelfcareApiGwAlarmContext(INTEROP_SELFCARE_API_GW_RUNBOOK_KEY),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
