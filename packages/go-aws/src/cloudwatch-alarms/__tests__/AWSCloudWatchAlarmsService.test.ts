import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DescribeAlarmHistoryCommand } from '@aws-sdk/client-cloudwatch';
import type { AlarmHistoryItem, CloudWatchClient } from '@aws-sdk/client-cloudwatch';

import { FakeAwsClient } from '../../__tests__/helpers/FakeAwsClient.js';

import {
  AWSCloudWatchAlarmsService,
  getAlarmHistoryIsoTimestamps,
  getAlarmHistoryStringValues,
  isCloudWatchAlarmStateTransition,
  selectAlarmHistoryProperties,
} from '../AWSCloudWatchAlarmsService.js';

function serviceOf(client: FakeAwsClient): AWSCloudWatchAlarmsService {
  return new AWSCloudWatchAlarmsService(client.as<CloudWatchClient>());
}

describe('AWSCloudWatchAlarmsService', () => {
  it('retrieves every page without mutating options and forwards the abort signal', async () => {
    const firstItem: AlarmHistoryItem = { AlarmName: 'alarm-a', Timestamp: new Date('2026-07-01T10:00:00Z') };
    const secondItem: AlarmHistoryItem = { AlarmName: 'alarm-b', Timestamp: new Date('2026-07-01T11:00:00Z') };
    const client = new FakeAwsClient([
      { AlarmHistoryItems: [firstItem], NextToken: 'next-page' },
      { AlarmHistoryItems: [secondItem] },
    ]);
    const service = serviceOf(client);
    const start = new Date('2026-07-01T00:00:00Z');
    const end = new Date('2026-07-02T00:00:00Z');
    const options = {
      timeRange: { start, end },
      alarmName: '  alarm-a  ',
      historyItemType: 'Action' as const,
      pageSize: 50,
    };
    const controller = new AbortController();

    const items = await service.describeAlarmHistory(options, controller.signal);

    assert.deepStrictEqual(items, [firstItem, secondItem]);
    const [first, second] = client.inputs(DescribeAlarmHistoryCommand);
    assert.deepStrictEqual(first, {
      StartDate: start,
      EndDate: end,
      AlarmTypes: ['CompositeAlarm', 'MetricAlarm'],
      ScanBy: 'TimestampDescending',
      MaxRecords: 50,
      AlarmName: 'alarm-a',
      HistoryItemType: 'Action',
    });
    assert.strictEqual(second?.['NextToken'], 'next-page');
    assert.deepStrictEqual(client.sendOptions[0], { abortSignal: controller.signal });
    assert.strictEqual(options.alarmName, '  alarm-a  ');
    assert.strictEqual(options.timeRange.start, start);
    assert.strictEqual(options.timeRange.end, end);
  });

  it('validates dates, alarm names and page sizes before sending requests', async () => {
    const client = new FakeAwsClient([]);
    const service = serviceOf(client);
    const validDate = new Date('2026-07-01T00:00:00Z');

    await assert.rejects(
      service.describeAlarmHistory({ timeRange: { start: new Date('invalid'), end: validDate } }),
      /start date is invalid/u,
    );
    await assert.rejects(
      service.describeAlarmHistory({ timeRange: { start: validDate, end: new Date('2026-06-30T00:00:00Z') } }),
      /must be before or equal/u,
    );
    await assert.rejects(
      service.describeAlarmHistory({ timeRange: { start: validDate, end: validDate }, alarmName: '   ' }),
      /alarm name cannot be empty/u,
    );
    await assert.rejects(
      service.describeAlarmHistory({ timeRange: { start: validDate, end: validDate }, pageSize: 101 }),
      /page size/u,
    );
    assert.strictEqual(client.commands.length, 0);
  });

  it('retrieves only valid OK-to-ALARM state transitions', async () => {
    const matching: AlarmHistoryItem = {
      AlarmName: 'alarm-a',
      HistoryData: JSON.stringify({ oldState: { stateValue: 'OK' }, newState: { stateValue: 'ALARM' } }),
    };
    const client = new FakeAwsClient([
      {
        AlarmHistoryItems: [
          matching,
          {
            AlarmName: 'alarm-a',
            HistoryData: JSON.stringify({ oldState: { stateValue: 'ALARM' }, newState: { stateValue: 'OK' } }),
          },
          { AlarmName: 'alarm-a', HistoryData: '{invalid' },
          { AlarmName: 'alarm-a' },
        ],
      },
    ]);
    const service = serviceOf(client);
    const date = new Date('2026-07-01T00:00:00Z');

    const items = await service.describeAlarmStateTransitions({ timeRange: { start: date, end: date } });

    assert.deepStrictEqual(items, [matching]);
    assert.strictEqual(client.inputs(DescribeAlarmHistoryCommand)[0]?.['HistoryItemType'], 'StateUpdate');
    assert.strictEqual(isCloudWatchAlarmStateTransition(matching), true);
  });

  it('provides immutable alarm-history projection helpers', () => {
    const items: AlarmHistoryItem[] = [
      { AlarmName: 'alarm-a', HistorySummary: 'first', Timestamp: new Date('2026-07-01T10:00:00Z') },
      { AlarmName: 'alarm-b', HistorySummary: 'second', Timestamp: new Date('2026-07-01T11:00:00Z') },
      { HistorySummary: 'unnamed' },
    ];

    assert.deepStrictEqual(getAlarmHistoryStringValues(items, 'AlarmName'), ['alarm-a', 'alarm-b']);
    assert.deepStrictEqual(getAlarmHistoryIsoTimestamps(items), [
      '2026-07-01T10:00:00.000Z',
      '2026-07-01T11:00:00.000Z',
    ]);
    assert.deepStrictEqual(getAlarmHistoryIsoTimestamps(items, 'alarm-b'), ['2026-07-01T11:00:00.000Z']);
    assert.deepStrictEqual(selectAlarmHistoryProperties(items, ['AlarmName', 'HistorySummary']), [
      { AlarmName: 'alarm-a', HistorySummary: 'first' },
      { AlarmName: 'alarm-b', HistorySummary: 'second' },
      { AlarmName: undefined, HistorySummary: 'unnamed' },
    ]);
  });
});
