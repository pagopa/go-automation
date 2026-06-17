import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogEvent } from '../../GOLogEvent.js';
import { GOLogEventCategory } from '../../GOLogEventCategory.js';
import { GOJsonLoggerHandler } from '../GOJsonLoggerHandler.js';

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

type CaptureFn = () => void;

function capture(fn: CaptureFn): Captured {
  let stdout = '';
  let stderr = '';
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalError = console.error.bind(console);
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
    return true;
  };
  console.error = ((...args: unknown[]): void => {
    stderr += `${args.map(String).join(' ')}\n`;
  }) as typeof console.error;

  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
    console.error = originalError;
  }

  return { stdout, stderr };
}

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
  });

  it('strips ANSI escape codes from the message', () => {
    const handler = new GOJsonLoggerHandler();
    const { stdout } = capture(() => handler.handle(GOLogEvent.info('\x1b[36mcolored\x1b[0m')));
    assert.strictEqual((JSON.parse(stdout) as { message: string }).message, 'colored');
  });

  it('maps WARNING to warn and routes ERROR to stderr', () => {
    const handler = new GOJsonLoggerHandler();

    const warn = capture(() => handler.handle(GOLogEvent.warning('careful')));
    assert.strictEqual((JSON.parse(warn.stdout) as { level: string }).level, 'warn');

    const err = capture(() => handler.handle(GOLogEvent.error('boom')));
    assert.strictEqual(err.stdout, '', 'errors do not go to stdout');
    assert.strictEqual((JSON.parse(err.stderr) as { level: string }).level, 'error');
  });

  it('includes the structured data payload as a field', () => {
    const handler = new GOJsonLoggerHandler();
    const data = { configuration: { 'a.b': { value: 'x', source: 'env' } } };
    const { stdout } = capture(() =>
      handler.handle(new GOLogEvent('Configuration summary', GOLogEventCategory.INFO, data)),
    );

    const record = JSON.parse(stdout) as Record<string, unknown>;
    assert.strictEqual(record['message'], 'Configuration summary');
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

  it('drops empty spacer events (no data)', () => {
    const handler = new GOJsonLoggerHandler();
    const { stdout } = capture(() => handler.handle(GOLogEvent.newline()));
    assert.strictEqual(stdout, '');
  });
});
