import { COMPUTE_AGREEMENTS_CONSUMER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';

describe('COMPUTE_AGREEMENTS_CONSUMER_ALARM.resolveContext', () => {
  it('resolves the prod, att and test alarm variants', () => {
    assert.deepStrictEqual(COMPUTE_AGREEMENTS_CONSUMER_ALARM.alarmNames, [
      'k8s-interop-be-compute-agreements-consumer-errors-prod',
      'k8s-interop-be-compute-agreements-consumer-errors-att',
      'k8s-interop-be-compute-agreements-consumer-errors-test',
    ]);

    for (const alarmName of COMPUTE_AGREEMENTS_CONSUMER_ALARM.alarmNames) {
      const context = COMPUTE_AGREEMENTS_CONSUMER_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, COMPUTE_AGREEMENTS_CONSUMER_ALARM.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, COMPUTE_AGREEMENTS_CONSUMER_ALARM.podApp);
    }
  });

  it('rejects alarm names outside the supported INTEROP environments', () => {
    assert.throws(
      () => COMPUTE_AGREEMENTS_CONSUMER_ALARM.resolveContext('k8s-interop-be-compute-agreements-consumer-errors-dev'),
      /Unsupported INTEROP alarm name/u,
    );
  });
});
