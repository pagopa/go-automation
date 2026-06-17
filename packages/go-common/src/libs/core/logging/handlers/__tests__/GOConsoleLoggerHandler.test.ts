import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogEvent } from '../../GOLogEvent.js';
import { GOLogEventCategory } from '../../GOLogEventCategory.js';
import { GOConsoleLoggerHandler } from '../GOConsoleLoggerHandler.js';
import { GOConsoleLoggerStyle } from '../GOConsoleLoggerStyle.js';

function createPlainConsoleStyle(): GOConsoleLoggerStyle {
  const style = new GOConsoleLoggerStyle();
  style.setStyle(GOLogEventCategory.HEADER, { format: 'H:{message}' });
  style.setStyle(GOLogEventCategory.SECTION, { format: 'S:{message}' });
  style.setStyle(GOLogEventCategory.STEP, { format: 'T:{message}' });
  style.setStyle(GOLogEventCategory.ERROR, { format: 'E:{message}' });
  style.setStyle(GOLogEventCategory.INFO, { format: 'I:{message}' });
  return style;
}

describe('GOConsoleLoggerHandler', () => {
  it('writes non-error events to stdout with hierarchical indentation and ignores fatal events', async () => {
    const handler = new GOConsoleLoggerHandler(createPlainConsoleStyle());
    let stdout = '';
    const errors: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    const originalError = console.error.bind(console);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      stdout += String(chunk);
      return true;
    };
    console.error = (...args: unknown[]): void => {
      errors.push(args.map(String).join(' '));
    };

    try {
      handler.handle(GOLogEvent.header('Root'));
      handler.handle(GOLogEvent.step('First'));
      handler.handle(GOLogEvent.section('Nested'));
      handler.handle(GOLogEvent.step('Second'));
      handler.handle(GOLogEvent.header('Next'));
      handler.handle(GOLogEvent.error('Problem'));
      handler.handle(GOLogEvent.fatal('Ignored'));

      await handler.reset();
      handler.handle(GOLogEvent.info('Flat'));
    } finally {
      process.stdout.write = originalWrite;
      console.error = originalError;
    }

    assert.deepStrictEqual(stdout.split('\n').filter(Boolean), [
      'H:Root',
      '  T:First',
      '  S:Nested',
      '    T:Second',
      'H:Next',
      'I:Flat',
    ]);
    assert.deepStrictEqual(errors, ['  E:Problem']);
  });

  it('exposes and replaces its style instance', () => {
    const initialStyle = createPlainConsoleStyle();
    const replacementStyle = createPlainConsoleStyle();
    const handler = new GOConsoleLoggerHandler(initialStyle);

    assert.strictEqual(handler.getStyle(), initialStyle);

    handler.setStyle(replacementStyle);

    assert.strictEqual(handler.getStyle(), replacementStyle);
  });
});
