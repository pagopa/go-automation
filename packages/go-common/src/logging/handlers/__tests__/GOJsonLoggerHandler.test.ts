import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogEvent } from '../../GOLogEvent.js';
import { GOLogEventCategory } from '../../GOLogEventCategory.js';
import { GOJsonLoggerHandler } from '../GOJsonLoggerHandler.js';
import type { CapturedOutput } from './helpers/CapturedOutput.js';
import { captureOutput as capture } from './helpers/captureOutput.js';

describe('GOJsonLoggerHandler', () => {
  it('emits one single-line JSON object with level, category, message and timestamp', () => {
    const handler = new GOJsonLoggerHandler();
    const { stdout } = capture(() => handler.handle(GOLogEvent.info('hello')));

    assert.ok(stdout.endsWith('\n'), 'each record ends with a newline');
    assert.strictEqual(stdout.split('\n').filter(Boolean).length, 1, 'exactly one line');

    const record = JSON.parse(stdout) as Record<string, unknown>;
    assert.strictEqual(record['level'], 'info');
    assert.strictEqual(record['category'], 'info');
    assert.strictEqual(record['message'], 'hello');
    assert.strictEqual(typeof record['timestamp'], 'string');

    const colored = capture(() => handler.handle(GOLogEvent.info('\x1b[36mcolored\x1b[0m')));
    assert.strictEqual((JSON.parse(colored.stdout) as { message: string }).message, 'colored', 'ANSI codes stripped');
  });

  it('maps WARNING to warn and routes ERROR to stderr', () => {
    const handler = new GOJsonLoggerHandler();

    const warn = capture(() => handler.handle(GOLogEvent.warning('careful')));
    assert.strictEqual((JSON.parse(warn.stdout) as { level: string }).level, 'warn');

    const err = capture(() => handler.handle(GOLogEvent.error('boom')));
    assert.strictEqual(err.stdout, '', 'errors do not go to stdout');
    assert.strictEqual((JSON.parse(err.stderr) as { level: string }).level, 'error');
  });

  it('includes the structured data payload and promotes its scalar fields to top-level query fields', () => {
    const handler = new GOJsonLoggerHandler();
    const data = {
      attempt: 2,
      eventType: 'configuration_parameter',
      message: 'payload message',
      nested: { value: 'kept only under data' },
      ok: true,
      requestId: 'req-123',
    };
    const { stdout } = capture(() => handler.handle(new GOLogEvent('payload', GOLogEventCategory.INFO, data)));

    const record = JSON.parse(stdout) as Record<string, unknown>;
    assert.strictEqual(record['message'], 'payload');
    assert.strictEqual(record['eventType'], 'configuration_parameter');
    assert.strictEqual(record['requestId'], 'req-123');
    assert.strictEqual(record['attempt'], 2);
    assert.strictEqual(record['ok'], true);
    assert.strictEqual(record['nested'], undefined);
    assert.deepStrictEqual(record['data'], data);
  });

  it('redacts sensitive message and structured data values', () => {
    const handler = new GOJsonLoggerHandler();
    const data = {
      authorization: 'Bearer nested-secret',
      nested: { message: 'password=raw-password' },
      safe: 'visible',
    };
    const { stdout } = capture(() =>
      handler.handle(new GOLogEvent('Authorization: Bearer abc.def.ghi', GOLogEventCategory.INFO, data)),
    );

    const record = JSON.parse(stdout) as Record<string, unknown>;
    assert.strictEqual(record['message'], 'Authorization: Bearer <redacted>');
    assert.deepStrictEqual(record['data'], {
      authorization: '[REDACTED]',
      nested: { message: 'password=<redacted>' },
      safe: 'visible',
    });
    assert.ok(!stdout.includes('abc.def.ghi'));
    assert.ok(!stdout.includes('nested-secret'));
    assert.ok(!stdout.includes('raw-password'));
  });

  it('serializes bigint and circular structured data without throwing', () => {
    const handler = new GOJsonLoggerHandler();
    const data: Record<string, unknown> = { count: 123n };
    data['self'] = data;

    const { stdout } = capture(() => handler.handle(new GOLogEvent('payload', GOLogEventCategory.INFO, data)));

    const record = JSON.parse(stdout) as Record<string, unknown>;
    assert.deepStrictEqual(record['data'], {
      count: '123',
      self: '[Circular]',
    });
  });

  it('falls back to a safe record when payload JSON serialization fails', () => {
    const handler = new GOJsonLoggerHandler();
    let captured: CapturedOutput | undefined;

    assert.doesNotThrow(() => {
      captured = capture(() =>
        handler.handle(
          new GOLogEvent('payload', GOLogEventCategory.INFO, {
            broken: {
              toJSON(): never {
                throw new Error('password=raw-secret');
              },
            },
          }),
        ),
      );
    });
    if (captured === undefined) {
      throw new Error('expected logger output to be captured');
    }

    const record = JSON.parse(captured.stdout) as Record<string, unknown>;
    assert.strictEqual(record['message'], 'payload');
    assert.strictEqual(record['data'], undefined);
    assert.strictEqual(record['jsonError'], '{"name":"Error","message":"password=<redacted>"}');
    assert.ok(!captured.stdout.includes('raw-secret'));
  });

  it('drops empty spacer events (no data)', () => {
    const handler = new GOJsonLoggerHandler();
    const { stdout } = capture(() => handler.handle(GOLogEvent.newline()));
    assert.strictEqual(stdout, '');
  });
});
