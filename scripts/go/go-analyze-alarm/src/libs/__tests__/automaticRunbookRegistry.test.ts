import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTOMATIC_RUNBOOK_REGISTRY } from '../runbookRegistry.js';

describe('AUTOMATIC_RUNBOOK_REGISTRY', () => {
  it('resolves the same descriptor by alarm name and by stable key', () => {
    const byAlarm = AUTOMATIC_RUNBOOK_REGISTRY.resolveByAlarmName('pn-delivery-B2B-ApiGwAlarm');
    assert.ok(byAlarm);
    const byKey = AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey(byAlarm.descriptor.key);
    assert.deepStrictEqual(byKey?.descriptor, byAlarm.descriptor);
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
});
