import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogEvent } from '../../GOLogEvent.js';
import { GOLogEventCategory } from '../../GOLogEventCategory.js';
import { GOFileLoggerStyle } from '../GOFileLoggerStyle.js';

function createEvent(message: string, category: GOLogEventCategory): GOLogEvent {
  const event = new GOLogEvent(message, category);
  Object.defineProperty(event, 'timestamp', {
    value: new Date(2026, 5, 17, 10, 11, 12, 345),
  });
  return event;
}

describe('GOFileLoggerStyle', () => {
  it('formats default file logger categories with timestamp, prefix and suffix', () => {
    const style = new GOFileLoggerStyle();

    assert.strictEqual(
      style.format(createEvent('Main', GOLogEventCategory.HEADER)),
      '[2026-06-17 10:11:12.345] [HEADER] === Main ===',
    );
    assert.strictEqual(
      style.format(createEvent('Part', GOLogEventCategory.SECTION)),
      '[2026-06-17 10:11:12.345] [SECTION] --- Part ---',
    );
    assert.strictEqual(
      style.format(createEvent('Done', GOLogEventCategory.SUCCESS)),
      '[2026-06-17 10:11:12.345] [SUCCESS] Done',
    );
    assert.strictEqual(style.format(createEvent('plain', GOLogEventCategory.TEXT)), '[2026-06-17 10:11:12.345] plain');
  });

  it('supports custom styles, category placeholders and ANSI stripping', () => {
    const style = new GOFileLoggerStyle();
    style.setStyle(GOLogEventCategory.INFO, {
      format: '{category}|{timestamp}|{prefix}{message}{suffix}',
      prefix: '<',
      suffix: '>',
    });

    assert.strictEqual(
      style.format(createEvent('\x1b[31mclean\x1b[0m', GOLogEventCategory.INFO)),
      'info|2026-06-17 10:11:12.345|<clean>',
    );
  });

  it('falls back to the step style for unknown categories', () => {
    const style = new GOFileLoggerStyle();

    assert.deepStrictEqual(style.getStyle('unknown' as GOLogEventCategory), style.getStyle(GOLogEventCategory.STEP));
  });
});
