import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defineInteropK8sAlarm } from '../defineInteropK8sAlarm.js';

const SPEC = { runbookKey: 'k8s-example-errors', podApp: 'example', varPrefix: 'interopExample' };

describe('defineInteropK8sAlarm environments', () => {
  it('preserves prod, att and test when no environment restriction is declared', () => {
    const alarm = defineInteropK8sAlarm(SPEC);
    assert.deepStrictEqual(
      alarm.alarmNames,
      ['prod', 'att', 'test'].map((env) => `${SPEC.runbookKey}-${env}`),
    );
    for (const env of ['prod', 'att', 'test']) {
      assert.strictEqual(alarm.resolveContext(`${SPEC.runbookKey}-${env}`).environment, env);
    }
  });

  it('restricts names and direct context resolution to the declared subset', () => {
    const alarm = defineInteropK8sAlarm({ ...SPEC, environments: ['att'] });
    assert.deepStrictEqual(alarm.alarmNames, [`${SPEC.runbookKey}-att`]);
    assert.strictEqual(alarm.resolveContext(`${SPEC.runbookKey}-att`).environment, 'att');
    for (const env of ['prod', 'test', 'dev']) {
      assert.throws(
        () => alarm.resolveContext(`${SPEC.runbookKey}-${env}`),
        /Expected one of: k8s-example-errors-att/u,
      );
    }
  });

  it('honors the subset when the environment appears inside a custom alarm name', () => {
    const alarm = defineInteropK8sAlarm({
      ...SPEC,
      environments: ['att', 'test'],
      alarmName: (key, env) => `${key}-${env}-namespace`,
    });
    assert.deepStrictEqual(alarm.alarmNames, [`${SPEC.runbookKey}-att-namespace`, `${SPEC.runbookKey}-test-namespace`]);
    assert.strictEqual(alarm.resolveContext(`${SPEC.runbookKey}-test-namespace`).environment, 'test');
    assert.throws(() => alarm.resolveContext(`${SPEC.runbookKey}-prod-namespace`), /Unsupported INTEROP alarm name/u);
  });
});
