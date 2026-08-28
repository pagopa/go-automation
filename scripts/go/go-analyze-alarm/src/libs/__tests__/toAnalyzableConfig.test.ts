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

  it('rejects a missing or blank alarm name', () => {
    const { alarmName: _alarmName, ...withoutName } = BASE;
    assert.throws(() => toAnalyzableConfig(withoutName), /alarm\.name is required/);
    assert.throws(() => toAnalyzableConfig({ ...BASE, alarmName: '   ' }), /alarm\.name is required/);
  });

  it('rejects a missing alarm datetime', () => {
    const { alarmDatetime: _alarmDatetime, ...withoutDatetime } = BASE;
    assert.throws(() => toAnalyzableConfig(withoutDatetime), /alarm\.datetime is required/);
  });

  it('rejects an empty AWS profile list', () => {
    const { awsProfiles: _awsProfiles, ...withoutProfiles } = BASE;
    assert.throws(() => toAnalyzableConfig(withoutProfiles), /aws\.profiles is required/);
    assert.throws(() => toAnalyzableConfig({ ...BASE, awsProfiles: ['  '] }), /aws\.profiles is required/);
  });
});
