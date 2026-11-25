import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogEvent } from '../GOLogEvent.js';
import { GOLogEventCategory } from '../GOLogEventCategory.js';

describe('GOLogEvent', () => {
  it('constructor sets message, category (STEP by default) and timestamp', () => {
    const event = new GOLogEvent('test message', GOLogEventCategory.INFO);
    assert.strictEqual(event.message, 'test message');
    assert.strictEqual(event.category, GOLogEventCategory.INFO);
    assert.ok(event.timestamp instanceof Date);
    assert.strictEqual(new GOLogEvent('default').category, GOLogEventCategory.STEP);
  });

  it('factories create events of their category', () => {
    const cases: ReadonlyArray<readonly [event: GOLogEvent, message: string, category: GOLogEventCategory]> = [
      [GOLogEvent.newline(), '', GOLogEventCategory.TEXT],
      [GOLogEvent.text('m'), 'm', GOLogEventCategory.TEXT],
      [GOLogEvent.step('m'), 'm', GOLogEventCategory.STEP],
      [GOLogEvent.success('m'), 'm', GOLogEventCategory.SUCCESS],
      [GOLogEvent.error('m'), 'm', GOLogEventCategory.ERROR],
      [GOLogEvent.fatal('m'), 'm', GOLogEventCategory.FATAL],
      [GOLogEvent.warning('m'), 'm', GOLogEventCategory.WARNING],
      [GOLogEvent.header('m'), 'm', GOLogEventCategory.HEADER],
      [GOLogEvent.info('m'), 'm', GOLogEventCategory.INFO],
      [GOLogEvent.section('m'), 'm', GOLogEventCategory.SECTION],
    ];
    for (const [event, message, category] of cases) {
      assert.strictEqual(event.message, message, category);
      assert.strictEqual(event.category, category);
    }
  });
});
