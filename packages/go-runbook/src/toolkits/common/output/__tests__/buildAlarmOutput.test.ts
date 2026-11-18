import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAlarmOutput } from '../buildAlarmOutput.js';

const FULL = new Map([
  ['alarmName', 'pn-foo-Alarm'],
  ['alarmDatetime', '2026-11-15T10:00:00.000Z'],
  ['alarmDatetimeEnd', '2026-11-15T10:30:00.000Z'],
  ['startTime', '2026-11-15T09:50:00.000Z'],
  ['endTime', '2026-11-15T10:35:00.000Z'],
]);

describe('buildAlarmOutput', () => {
  it('copies every alarm parameter, in the serialized key order, ignoring the others', () => {
    const alarm = buildAlarmOutput(new Map([...FULL, ['awsRegion', 'eu-south-1']]));
    assert.deepStrictEqual(alarm, {
      name: 'pn-foo-Alarm',
      datetime: '2026-11-15T10:00:00.000Z',
      datetimeEnd: '2026-11-15T10:30:00.000Z',
      timeRange: { start: '2026-11-15T09:50:00.000Z', end: '2026-11-15T10:35:00.000Z' },
    });
    // deepStrictEqual ignores key order; the output JSON does not.
    assert.deepStrictEqual(Object.keys(alarm), ['name', 'datetime', 'datetimeEnd', 'timeRange']);
    assert.deepStrictEqual(Object.keys(alarm.timeRange), ['start', 'end']);
  });

  it('trims values and omits blanks, the "-" placeholder and missing parameters, keeping the timeRange', () => {
    // deepStrictEqual also fails on a key set to undefined.
    const cases: ReadonlyArray<readonly [ReadonlyArray<readonly [string, string]>, unknown]> = [
      [
        [
          ['alarmName', '  pn-foo-Alarm  '],
          ['alarmDatetime', '   '],
          ['alarmDatetimeEnd', '-'],
          ['startTime', ''],
          ['endTime', ' 2026-11-15T10:35:00.000Z '],
        ],
        { name: 'pn-foo-Alarm', timeRange: { end: '2026-11-15T10:35:00.000Z' } },
      ],
      [[['startTime', '2026-11-15T09:50:00.000Z']], { timeRange: { start: '2026-11-15T09:50:00.000Z' } }],
      [[], { timeRange: {} }],
    ];
    for (const [params, expected] of cases) {
      assert.deepStrictEqual(buildAlarmOutput(new Map(params)), expected);
    }
  });
});
