import { interop } from '../../framework.js';
import { BFF_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('BFF_ALARM.resolveContext', () => {
  it('resolves every supported environment-specific alarm to the same canonical runbook key', () => {
    for (const alarmName of BFF_ALARM.alarmNames) {
      const context = BFF_ALARM.resolveContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, BFF_ALARM.runbookKey);
      assert.strictEqual(context.logGroup, interop.k8s.buildInteropK8sApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, 'interop-be-backend-for-frontend');
    }
  });

  it('rejects unsupported alarm names instead of replacing environment tokens generically', () => {
    assert.throws(
      () => BFF_ALARM.resolveContext('k8s-interop-be-att-residence-verification-errors-att-eservices'),
      /Unsupported INTEROP alarm name/,
    );
  });
});
