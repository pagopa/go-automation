import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTOMATIC_RUNBOOK_REGISTRY, AutomaticRunbookRegistry } from '../runbookRegistry.js';

describe('AUTOMATIC_RUNBOOK_REGISTRY', () => {
  it('resolves the same descriptor by alarm name and by stable key', () => {
    const byAlarm = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('pn-delivery-B2B-ApiGwAlarm');
    assert.ok(byAlarm);
    const byKey = AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey(byAlarm.descriptor.key);
    assert.deepStrictEqual(byKey?.descriptor, byAlarm.descriptor);
  });

  it('resolves INTEROP environment aliases to the same canonical descriptor', () => {
    const prod = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('k8s-interop-be-backend-for-frontend-errors-prod');
    const att = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('k8s-interop-be-backend-for-frontend-errors-att');
    const test = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('k8s-interop-be-backend-for-frontend-errors-test');

    assert.ok(prod);
    assert.ok(att);
    assert.ok(test);
    assert.strictEqual(prod.descriptor.key, 'k8s-interop-be-backend-for-frontend-errors');
    assert.deepStrictEqual(att.descriptor, prod.descriptor);
    assert.deepStrictEqual(test.descriptor, prod.descriptor);
    assert.deepStrictEqual(prod.descriptor.alarmNames, [
      'k8s-interop-be-backend-for-frontend-errors-att',
      'k8s-interop-be-backend-for-frontend-errors-prod',
      'k8s-interop-be-backend-for-frontend-errors-test',
    ]);
  });

  it('lists stable sorted descriptors and validates every cloud runbook', () => {
    const first = AUTOMATIC_RUNBOOK_REGISTRY.listDescriptors();
    const second = AUTOMATIC_RUNBOOK_REGISTRY.listDescriptors();
    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(
      first.map(({ key }) => key),
      first.map(({ key }) => key).sort(),
    );
    assert.ok(first.every(({ definitionDigest }) => /^sha256-[a-f0-9]{64}$/.test(definitionDigest)));
    assert.doesNotThrow(() => AUTOMATIC_RUNBOOK_REGISTRY.validateForCloud());
  });

  it('builds each runbook once per descriptor or validation pass', () => {
    const source = AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey('pn-delivery-B2B-ApiGwAlarm');
    assert.ok(source);
    let buildCalls = 0;
    const registry = new AutomaticRunbookRegistry([
      {
        key: source.descriptor.key,
        alarmNames: source.descriptor.alarmNames,
        kind: source.descriptor.kind,
        categories: source.descriptor.categories as readonly [string, ...string[]],
        build: () => {
          buildCalls += 1;
          return source.build();
        },
      },
    ]);

    assert.strictEqual(buildCalls, 1);
    registry.validateForCloud();
    assert.strictEqual(buildCalls, 2);
  });
});
