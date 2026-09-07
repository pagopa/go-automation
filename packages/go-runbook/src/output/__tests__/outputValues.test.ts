import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookResultField } from '../RunbookOutputContext.js';
import { addResultField, normalizeOutputValue, optionalNumber, optionalString } from '../outputValues.js';

describe('normalizeOutputValue', () => {
  it('trims the value', () => {
    assert.strictEqual(normalizeOutputValue('  504 '), '504');
  });

  it('treats undefined, empty and whitespace-only as absent', () => {
    assert.strictEqual(normalizeOutputValue(undefined), undefined);
    assert.strictEqual(normalizeOutputValue(''), undefined);
    assert.strictEqual(normalizeOutputValue('   '), undefined);
  });

  it('treats the "-" access-log placeholder as absent', () => {
    // The log-domain rule this adds on top of go-common's trimToUndefined:
    // "-" is what CloudWatch and API Gateway write for a field they did not
    // capture, so it must not reach the output as a value.
    assert.strictEqual(normalizeOutputValue('-'), undefined);
    assert.strictEqual(normalizeOutputValue('  -  '), undefined);
  });

  it('keeps a value that merely contains a hyphen', () => {
    assert.strictEqual(normalizeOutputValue('no-match'), 'no-match');
  });
});

describe('optionalString / optionalNumber', () => {
  it('emits the key only when the value carries content', () => {
    assert.deepStrictEqual(optionalString('name', ' alarm '), { name: 'alarm' });
    assert.deepStrictEqual(optionalString('name', '-'), {});
    assert.deepStrictEqual(optionalString('name', undefined), {});
  });

  it('emits numbers as-is, including zero', () => {
    assert.deepStrictEqual(optionalNumber('errorCount', 0), { errorCount: 0 });
    assert.deepStrictEqual(optionalNumber('errorCount', undefined), {});
  });
});

describe('addResultField', () => {
  it('appends normalised fields and skips absent ones', () => {
    const fields: RunbookResultField[] = [];
    addResultField(fields, 'alarmName', 'Alarm', '  my-alarm ');
    addResultField(fields, 'traceId', 'Trace ID', '-');
    addResultField(fields, 'statusCode', 'Status', undefined);
    addResultField(fields, 'sourceIp', 'Source IP', '10.0.0.1');

    assert.deepStrictEqual(fields, [
      { name: 'alarmName', label: 'Alarm', value: 'my-alarm' },
      { name: 'sourceIp', label: 'Source IP', value: '10.0.0.1' },
    ]);
  });
});
