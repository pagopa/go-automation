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
  it('copies every parameter, in the serialized key order', () => {
    const alarm = buildAlarmOutput(FULL);
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

  it('normalises values: trims them and omits blanks and the "-" placeholder', () => {
    assert.deepStrictEqual(
      buildAlarmOutput(
        new Map([
          ['alarmName', '  pn-foo-Alarm  '],
          ['alarmDatetime', '   '],
          ['alarmDatetimeEnd', '-'],
          ['startTime', ''],
          ['endTime', ' 2026-11-15T10:35:00.000Z '],
        ]),
      ),
      { name: 'pn-foo-Alarm', timeRange: { end: '2026-11-15T10:35:00.000Z' } },
    );
  });

  it('omits the missing properties instead of setting them to undefined', () => {
    const alarm = buildAlarmOutput(new Map([['alarmName', 'pn-foo-Alarm']]));
    assert.deepStrictEqual(Object.keys(alarm), ['name', 'timeRange']);
    assert.ok(!('datetime' in alarm) && !('datetimeEnd' in alarm));
  });

  it('keeps an empty timeRange when no bound is available', () => {
    assert.deepStrictEqual(buildAlarmOutput(new Map()), { timeRange: {} });
  });

  it('keeps a partial window with only the available bound', () => {
    assert.deepStrictEqual(buildAlarmOutput(new Map([['startTime', '2026-11-15T09:50:00.000Z']])), {
      timeRange: { start: '2026-11-15T09:50:00.000Z' },
    });
    assert.deepStrictEqual(buildAlarmOutput(new Map([['endTime', '2026-11-15T10:35:00.000Z']])), {
      timeRange: { end: '2026-11-15T10:35:00.000Z' },
    });
  });

  it('ignores parameters that are not part of the alarm block', () => {
    assert.deepStrictEqual(buildAlarmOutput(new Map([...FULL, ['awsRegion', 'eu-south-1']])), buildAlarmOutput(FULL));
  });
});
