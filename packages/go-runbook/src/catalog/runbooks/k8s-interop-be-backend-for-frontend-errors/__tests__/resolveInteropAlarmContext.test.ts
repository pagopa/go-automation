import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTEROP_BFF_ALARM_NAMES,
  INTEROP_BFF_RUNBOOK_KEY,
  buildInteropApplicationLogGroup,
  resolveInteropBffAlarmContext,
} from '../resolveInteropAlarmContext.js';

describe('resolveInteropBffAlarmContext', () => {
  it('resolves every supported environment-specific alarm to the same canonical runbook key', () => {
    for (const alarmName of INTEROP_BFF_ALARM_NAMES) {
      const context = resolveInteropBffAlarmContext(alarmName);
      assert.strictEqual(context.alarmName, alarmName);
      assert.strictEqual(context.runbookKey, INTEROP_BFF_RUNBOOK_KEY);
      assert.strictEqual(context.logGroup, buildInteropApplicationLogGroup(context.environment));
      assert.strictEqual(context.podApp, 'interop-be-backend-for-frontend');
    }
  });

  it('rejects unsupported alarm names instead of replacing environment tokens generically', () => {
    assert.throws(
      () => resolveInteropBffAlarmContext('k8s-interop-be-att-residence-verification-errors-att-eservices'),
      /Unsupported INTEROP alarm name/,
    );
  });
});
