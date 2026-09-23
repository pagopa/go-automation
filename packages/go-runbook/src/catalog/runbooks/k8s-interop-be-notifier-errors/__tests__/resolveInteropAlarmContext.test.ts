import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { interop } from '../../framework.js';
import { NOTIFIER_ALARM as alarm } from '../alarmDefinition.js';

describe('NOTIFIER_ALARM.resolveContext', () => {
  it('resolves every documented environment with the notifier pod and log group', () => {
    assert.deepStrictEqual(alarm.alarmNames, [
      'k8s-interop-be-notifier-errors-prod',
      'k8s-interop-be-notifier-errors-att',
      'k8s-interop-be-notifier-errors-test',
    ]);
    for (const alarmName of alarm.alarmNames) {
      const context = alarm.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, alarm.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, 'interop-be-notifier');
    }
  });

  it('rejects unsupported alarm names', () => {
    assert.throws(() => alarm.resolveContext('k8s-interop-be-notifier-errors-dev'), /Unsupported INTEROP alarm name/u);
  });
});
