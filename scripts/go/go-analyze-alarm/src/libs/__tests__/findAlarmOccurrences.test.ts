import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Core } from '@go-automation/go-common';

import { assertRangeModeConfig, findAlarmOccurrences } from '../findAlarmOccurrences.js';
import type { AnalyzableAlarmConfig } from '../../types/AnalyzableAlarmConfig.js';

describe('findAlarmOccurrences', () => {
  it('queries CloudWatch history for the concrete alarm name and returns sorted unique timestamps', async () => {
    let seenOptions: unknown;
    const script = {
      aws: {
        services: {
          cloudWatchAlarms: {
            async describeAlarmStateTransitions(
              options: unknown,
            ): Promise<ReadonlyArray<{ readonly Timestamp?: Date }>> {
              seenOptions = options;
              await Promise.resolve();
              return [
                { Timestamp: new Date('2026-07-09T10:05:00.000Z') },
                { Timestamp: new Date('2026-07-09T10:00:00.000Z') },
                { Timestamp: new Date('2026-07-09T10:05:00.000Z') },
                {},
              ];
            },
          },
        },
      },
    } as unknown as Core.GOScript;

    const occurrences = await findAlarmOccurrences(script, {
      alarmName: 'k8s-interop-be-backend-for-frontend-errors-att',
      alarmDatetime: '2026-07-09T10:00:00.000Z',
      alarmDatetimeEnd: '2026-07-09T11:00:00.000Z',
    });

    assert.deepStrictEqual(occurrences, ['2026-07-09T10:00:00.000Z', '2026-07-09T10:05:00.000Z']);
    assert.deepStrictEqual(seenOptions, {
      alarmName: 'k8s-interop-be-backend-for-frontend-errors-att',
      timeRange: {
        start: new Date('2026-07-09T10:00:00.000Z'),
        end: new Date('2026-07-09T11:00:00.000Z'),
      },
      scanBy: 'TimestampAscending',
    });
  });

  it('accepts a valid range config and rejects missing end or single mode', () => {
    const rangeConfig: AnalyzableAlarmConfig = {
      analysisMode: 'range',
      alarmName: 'alarm',
      alarmDatetime: '2026-07-09T10:00:00.000Z',
      alarmDatetimeEnd: '2026-07-09T11:00:00.000Z',
      awsProfiles: ['profile'],
      statsDetail: true,
      statsSave: false,
    };
    assert.doesNotThrow(() => assertRangeModeConfig(rangeConfig));

    const { alarmDatetimeEnd: _alarmDatetimeEnd, ...withoutEnd } = rangeConfig;
    assert.throws(() => assertRangeModeConfig(withoutEnd), /alarm\.datetime\.end is required/);

    const singleConfig: AnalyzableAlarmConfig = { ...withoutEnd, analysisMode: 'single' };
    assert.throws(() => assertRangeModeConfig(singleConfig), /analysis\.mode=single/);
  });
});
