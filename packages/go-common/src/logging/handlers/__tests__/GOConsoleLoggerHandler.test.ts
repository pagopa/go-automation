import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogEvent } from '../../GOLogEvent.js';
import { GOLogEventCategory } from '../../GOLogEventCategory.js';
import { GOConsoleLoggerHandler } from '../GOConsoleLoggerHandler.js';
import { GOConsoleLoggerStyle } from '../GOConsoleLoggerStyle.js';
import { captureOutput } from './helpers/captureOutput.js';

function createPlainConsoleStyle(infoFormat: string = 'I:{message}'): GOConsoleLoggerStyle {
  const style = new GOConsoleLoggerStyle();
  style.setStyle(GOLogEventCategory.HEADER, { format: 'H:{message}' });
  style.setStyle(GOLogEventCategory.SECTION, { format: 'S:{message}' });
  style.setStyle(GOLogEventCategory.STEP, { format: 'T:{message}' });
  style.setStyle(GOLogEventCategory.ERROR, { format: 'E:{message}' });
  style.setStyle(GOLogEventCategory.INFO, { format: infoFormat });
  return style;
}

/** Non-empty output lines. */
function lines(text: string): string[] {
  return text.split('\n').filter(Boolean);
}

describe('GOConsoleLoggerHandler', () => {
  it('writes non-error events to stdout with hierarchical indentation and ignores fatal events', async () => {
    const handler = new GOConsoleLoggerHandler(createPlainConsoleStyle());

    const nested = captureOutput(() => {
      handler.handle(GOLogEvent.header('Root'));
      handler.handle(GOLogEvent.step('First'));
      handler.handle(GOLogEvent.section('Nested'));
      handler.handle(GOLogEvent.step('Second'));
      handler.handle(GOLogEvent.header('Next'));
      handler.handle(GOLogEvent.error('Problem'));
      handler.handle(GOLogEvent.fatal('Ignored'));
    });
    await handler.reset();
    const afterReset = captureOutput(() => handler.handle(GOLogEvent.info('Flat')));

    assert.deepStrictEqual(lines(nested.stdout), ['H:Root', '  T:First', '  S:Nested', '    T:Second', 'H:Next']);
    assert.deepStrictEqual(lines(nested.stderr), ['  E:Problem']);
    assert.deepStrictEqual(lines(afterReset.stdout), ['I:Flat']);
  });

  it('formats with the style set by setStyle', () => {
    const handler = new GOConsoleLoggerHandler(createPlainConsoleStyle());
    const replacement = createPlainConsoleStyle('R:{message}');
    handler.setStyle(replacement);

    assert.strictEqual(handler.getStyle(), replacement);
    assert.deepStrictEqual(lines(captureOutput(() => handler.handle(GOLogEvent.info('x'))).stdout), ['R:x']);
  });

  it('redacts sensitive values before writing to the console', () => {
    const handler = new GOConsoleLoggerHandler(createPlainConsoleStyle());

    const { stdout, stderr } = captureOutput(() => {
      handler.handle(GOLogEvent.info('password=secret'));
      handler.handle(GOLogEvent.error('Authorization: Bearer abc.def.ghi'));
    });

    assert.ok(!stdout.includes('secret'));
    assert.ok(!stderr.includes('abc.def.ghi'));
    assert.match(stdout, /I:password=<redacted>/u);
    assert.match(stderr, /E:Authorization: Bearer <redacted>/u);
  });

  it('strips ANSI escape codes unless colors are enabled (NO_COLOR / FORCE_COLOR)', () => {
    // colorsEnabled is computed at construction → construct inside the env scope.
    const logHello = (): void => new GOConsoleLoggerHandler().handle(GOLogEvent.info('hello world'));

    const plain = captureOutput(logHello, { NO_COLOR: '1', FORCE_COLOR: undefined }).stdout;
    assert.ok(plain.includes('hello world'), 'message text should be present');
    assert.ok(!plain.includes('\x1b['), `output should not contain ANSI escapes, got: ${JSON.stringify(plain)}`);

    const colored = captureOutput(logHello, { NO_COLOR: undefined, FORCE_COLOR: '1' }).stdout;
    assert.ok(colored.includes('hello world'), 'message text should be present');
    assert.ok(colored.includes('\x1b['), 'output should contain ANSI escapes when colors are forced');
  });
});
