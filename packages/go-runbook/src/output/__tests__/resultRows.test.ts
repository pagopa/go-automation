import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@go-automation/go-common/aws';

import { extractRecentLogLines, logLineToRecord, readFirstRowField } from '../resultRows.js';

function row(timestamp: string, message: string): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: timestamp },
    { field: '@message', value: message },
  ];
}

describe('readFirstRowField', () => {
  it('falls back to the next name when the first holds the "-" placeholder', () => {
    const candidate: ReadonlyArray<ResultField> = [
      { field: '@message', value: '-' },
      { field: 'message', value: 'real message' },
    ];
    assert.strictEqual(readFirstRowField(candidate, ['@message', 'message']), 'real message');
  });

  it('returns undefined when no name carries content', () => {
    assert.strictEqual(readFirstRowField(row('t', '  '), ['@message', 'message']), undefined);
  });
});

describe('extractRecentLogLines', () => {
  it('sorts by timestamp and keeps the newest lines, oldest first', () => {
    const lines = extractRecentLogLines(
      [
        row('2026-01-01T00:00:03.000Z', 'third'),
        row('2026-01-01T00:00:01.000Z', 'first'),
        row('2026-01-01T00:00:02.000Z', 'second'),
      ],
      2,
    );
    assert.deepStrictEqual(
      lines.map((line) => line.message),
      ['second', 'third'],
    );
  });

  it('drops rows with no usable message', () => {
    const lines = extractRecentLogLines(
      [row('2026-01-01T00:00:01.000Z', '-'), row('2026-01-01T00:00:02.000Z', 'ok')],
      5,
    );
    assert.deepStrictEqual(
      lines.map((line) => line.message),
      ['ok'],
    );
  });

  it('defaults the timestamp to an empty string when absent', () => {
    const lines = extractRecentLogLines([[{ field: '@message', value: 'no timestamp' }]], 5);
    assert.deepStrictEqual(lines, [{ timestamp: '', message: 'no timestamp' }]);
  });

  it('sorts unparseable timestamps first instead of breaking the comparison', () => {
    const lines = extractRecentLogLines([row('not-a-date', 'broken'), row('2026-01-01T00:00:01.000Z', 'valid')], 5);
    assert.deepStrictEqual(
      lines.map((line) => line.message),
      ['broken', 'valid'],
    );
  });
});

describe('logLineToRecord', () => {
  it('renders the line as a flat string record', () => {
    assert.deepStrictEqual(logLineToRecord({ timestamp: 't', message: 'm' }), { timestamp: 't', message: 'm' });
  });
});
