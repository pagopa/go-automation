import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toAnalyzableConfig } from '../toAnalyzableConfig.js';
import type { GoAnalyzeAlarmConfig } from '../../types/GoAnalyzeAlarmConfig.js';

const BASE: GoAnalyzeAlarmConfig = {
  analysisMode: 'single',
  alarmName: 'alarm',
  alarmDatetime: '2026-07-09T10:00:00.000Z',
  awsProfiles: ['profile'],
  statsDetail: true,
  statsSave: false,
};

describe('toAnalyzableConfig', () => {
  it('returns the alarm inputs trimmed', () => {
    const config = toAnalyzableConfig({
      ...BASE,
      alarmName: '  alarm  ',
      alarmDatetime: '  2026-07-09T10:00:00.000Z  ',
      awsProfiles: [' profile ', '  '],
    });

    assert.equal(config.alarmName, 'alarm');
    assert.equal(config.alarmDatetime, '2026-07-09T10:00:00.000Z');
    assert.deepEqual(config.awsProfiles, ['profile']);
    assert.equal(config.analysisMode, 'single');
  });

  it('rejects a missing or blank alarm name, a missing datetime and an empty profile list', () => {
    const { alarmName: _alarmName, ...withoutName } = BASE;
    const { alarmDatetime: _alarmDatetime, ...withoutDatetime } = BASE;
    const { awsProfiles: _awsProfiles, ...withoutProfiles } = BASE;
    const cases: ReadonlyArray<readonly [GoAnalyzeAlarmConfig, RegExp]> = [
      [withoutName, /alarm\.name is required/],
      [{ ...BASE, alarmName: '   ' }, /alarm\.name is required/],
      [withoutDatetime, /alarm\.datetime is required/],
      [withoutProfiles, /aws\.profiles is required/],
      [{ ...BASE, awsProfiles: ['  '] }, /aws\.profiles is required/],
    ];
    for (const [config, message] of cases) assert.throws(() => toAnalyzableConfig(config), message);
  });
});
