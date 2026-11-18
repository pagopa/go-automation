import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookResultField } from '../RunbookOutputContext.js';
import { addResultField, normalizeOutputValue, optionalNumber, optionalString } from '../outputValues.js';

describe('normalizeOutputValue', () => {
  it('trims the value and treats undefined, blanks and the "-" access-log placeholder as absent', () => {
    // "-" is what CloudWatch and API Gateway write for a field they did not
    // capture: the log-domain rule this adds on top of go-common's trimToUndefined.
    for (const [value, expected] of [
      ['  504 ', '504'],
      ['no-match', 'no-match'],
      [undefined, undefined],
      ['', undefined],
      ['   ', undefined],
      ['-', undefined],
      ['  -  ', undefined],
    ] as const) {
      assert.strictEqual(normalizeOutputValue(value), expected, String(value));
    }
  });
});

describe('optionalString / optionalNumber', () => {
  it('emits the key only when the value carries content, numbers including zero', () => {
    assert.deepStrictEqual(optionalString('name', ' alarm '), { name: 'alarm' });
    assert.deepStrictEqual(optionalString('name', '-'), {});
    assert.deepStrictEqual(optionalString('name', undefined), {});
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
