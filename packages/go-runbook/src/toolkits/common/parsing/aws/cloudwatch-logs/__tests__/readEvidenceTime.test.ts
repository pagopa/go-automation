import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { readEvidenceTime } from '../readEvidenceTime.js';

const AT = (iso: string): number => Date.parse(iso);

describe('readEvidenceTime', () => {
  it('reads a Logs Insights row in UTC, with its identifiers', () => {
    const time = readEvidenceTime([
      { field: '@timestamp', value: '2026-11-19 10:15:42.123' },
      { field: 'trace_id', value: '1-abc' },
      { field: 'requestId', value: '-' },
    ]);
    assert.deepStrictEqual(time, {
      first: AT('2026-11-19T10:15:42.123Z'),
      last: AT('2026-11-19T10:15:42.123Z'),
      weight: 1,
      identifiers: [{ kind: 'traceId', value: '1-abc', at: AT('2026-11-19T10:15:42.123Z') }],
    });
  });

  it('reads the interval and the count of an aggregate row', () => {
    const time = readEvidenceTime([
      { field: 'firstTimestamp', value: '2026-11-19 10:01:00.000' },
      { field: 'latestTimestamp', value: '2026-11-19 10:07:00.000' },
      { field: 'count', value: '3' },
    ]);
    assert.deepStrictEqual(time, { first: AT('2026-11-19T10:01:00Z'), last: AT('2026-11-19T10:07:00Z'), weight: 3 });
  });

  it('dates the identifier kept by an aggregate at its latest row, and each row of a combination at its own time', () => {
    const aggregate = readEvidenceTime([
      { field: 'firstTimestamp', value: '2026-11-19 10:01:00.000' },
      { field: 'latestTimestamp', value: '2026-11-19 10:07:00.000' },
      { field: 'cid', value: 'B' },
      { field: 'count', value: '2' },
    ]);
    assert.deepStrictEqual(aggregate?.identifiers, [{ kind: 'cid', value: 'B', at: AT('2026-11-19T10:07:00Z') }]);
    const combined = readEvidenceTime({
      supportingRows: [
        { timestamp: '2026-11-19 10:01:00.000', cid: 'A' },
        { timestamp: '2026-11-19 10:07:00.000', cid: 'B' },
      ],
    });
    assert.deepStrictEqual(combined?.identifiers, [
      { kind: 'cid', value: 'A', at: AT('2026-11-19T10:01:00Z') },
      { kind: 'cid', value: 'B', at: AT('2026-11-19T10:07:00Z') },
    ]);
  });

  it('reads the rows that support an object, and the interval of a group', () => {
    const supported = readEvidenceTime({
      supportingRows: [{ timestamp: '2026-11-19 10:05:00.000' }, { timestamp: '2026-11-19 10:02:00.000' }],
    });
    assert.deepStrictEqual(supported, {
      first: AT('2026-11-19T10:02:00Z'),
      last: AT('2026-11-19T10:05:00Z'),
      weight: 2,
    });
    const group = readEvidenceTime({
      cid: 'a',
      rows: [
        [{ field: '@timestamp', value: '2026-11-19T10:09:00Z' }],
        [{ field: '@timestamp', value: '2026-11-19T10:03:00Z' }],
      ],
    });
    assert.deepStrictEqual(group, { first: AT('2026-11-19T10:03:00Z'), last: AT('2026-11-19T10:09:00Z'), weight: 1 });
  });

  it('keeps an identifier of an untimed row untimed inside a timed group', () => {
    const combined = readEvidenceTime({
      supportingRows: [{ timestamp: '2026-11-19 10:01:00.000', cid: 'A' }, { cid: 'B' }],
    });
    assert.strictEqual(combined?.first, AT('2026-11-19T10:01:00Z'));
    assert.deepStrictEqual(combined?.identifiers, [
      { kind: 'cid', value: 'A', at: AT('2026-11-19T10:01:00Z') },
      { kind: 'cid', value: 'B' },
    ]);
  });

  it('keeps an untimed identifier untimed through nested groups', () => {
    const nested = readEvidenceTime({
      supportingRows: [{ supportingRows: [{ timestamp: '2026-11-19 10:01:00.000', cid: 'A' }, { cid: 'B' }] }],
    });
    assert.deepStrictEqual(nested?.identifiers, [
      { kind: 'cid', value: 'A', at: AT('2026-11-19T10:01:00Z') },
      { kind: 'cid', value: 'B' },
    ]);
  });

  it('keeps the identifiers of an element without time, as untimed', () => {
    assert.deepStrictEqual(readEvidenceTime({ requestId: 'req-1', messages: ['boom'] }), {
      weight: 1,
      identifiers: [{ kind: 'requestId', value: 'req-1' }],
    });
  });

  it('has no time for an element without a readable timestamp', () => {
    assert.strictEqual(readEvidenceTime([{ field: '@message', value: 'boom' }]), undefined);
    assert.strictEqual(readEvidenceTime([{ field: '@timestamp', value: 'not a date' }]), undefined);
    assert.strictEqual(readEvidenceTime('text'), undefined);
  });
});
