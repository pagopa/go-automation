import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';
import { PURPOSE_OUTBOUND_WRITER_ALARM as alarm } from '../alarmDefinition.js';

describe('PURPOSE_OUTBOUND_WRITER_ALARM.resolveContext', () => {
  it('resolves prod, att and test with their environment-specific log group', () => {
    assert.deepStrictEqual(alarm.alarmNames, [
      'k8s-interop-be-purpose-outbound-writer-errors-prod',
      'k8s-interop-be-purpose-outbound-writer-errors-att',
      'k8s-interop-be-purpose-outbound-writer-errors-test',
    ]);
    for (const alarmName of alarm.alarmNames) {
      const context = alarm.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, alarm.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, alarm.podApp);
    }
  });

  it('rejects unsupported or copied alarm names', () => {
    for (const alarmName of [
      'k8s-interop-be-purpose-outbound-writer-errors-dev',
      'k8s-interop-be-notification-user-lifecycle-consumer-errors-prod',
    ]) {
      assert.throws(() => alarm.resolveContext(alarmName), /Unsupported INTEROP alarm name/u);
    }
  });
});
