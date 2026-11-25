import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestRunbook } from '../../../__tests__/helpers/createTestRunbook.js';
import { buildOccurrenceParams } from '../buildOccurrenceParams.js';

describe('buildOccurrenceParams', () => {
  it('writes the occurrence, the AWS context and the time range of the runbook, in a stable order', () => {
    const runbook = { ...createTestRunbook(), occurrenceTimeWindow: { beforeMinutes: 10, afterMinutes: 5 } };

    const params = buildOccurrenceParams(runbook, {
      alarmName: 'example-alarm',
      alarmDatetime: '2026-11-22T10:00:00.000Z',
      awsAccountId: '123456789012',
      awsRegion: 'eu-south-1',
      awsProfiles: ['reader', 'fallback'],
    });

    assert.deepStrictEqual(Object.fromEntries(params), {
      alarmName: 'example-alarm',
      alarmDatetime: '2026-11-22T10:00:00.000Z',
      awsAccountId: '123456789012',
      awsRegion: 'eu-south-1',
      awsProfiles: 'reader,fallback',
      startTime: '2026-11-22T09:50:00.000Z',
      endTime: '2026-11-22T10:05:00.000Z',
    });
    assert.deepStrictEqual([...params.keys()].slice(0, 3), ['alarmName', 'alarmDatetime', 'awsAccountId']);
  });

  it('adds the last occurrence only when given, and the account only when known', () => {
    const params = buildOccurrenceParams(createTestRunbook(), {
      alarmName: 'example-alarm',
      alarmDatetime: '2026-11-22T10:00:00.000Z',
      alarmDatetimeEnd: '2026-11-22T10:30:00.000Z',
      awsRegion: 'eu-south-1',
      awsProfiles: ['reader'],
    });

    assert.strictEqual(params.has('awsAccountId'), false);
    assert.strictEqual(params.get('alarmDatetimeEnd'), '2026-11-22T10:30:00.000Z');
  });
});
