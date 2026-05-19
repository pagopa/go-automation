import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ApiGwAlarmConfig } from '../../types/ApiGwAlarmConfig.js';
import { resolveApiGwQueryProfile } from '../resolveApiGwQueryProfile.js';
import { SEND_API_GW_PROFILE } from '../SEND_API_GW_PROFILE.js';
import type { ApiGwQueryProfile } from '../ApiGwQueryProfile.js';

function baseConfig(overrides: Partial<ApiGwAlarmConfig> = {}): ApiGwAlarmConfig {
  return {
    id: 'test',
    metadata: {
      name: 'Test',
      description: 'desc',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    apiGwLogGroup: '/aws/apigw/main',
    entryService: { name: 'pn-a', logGroup: '/aws/ecs/pn-a', varPrefix: 'a' },
    knownUrls: [],
    knownCases: [],
    ...overrides,
  };
}

describe('resolveApiGwQueryProfile', () => {
  it('returns the explicit queryProfile when provided', () => {
    const custom: ApiGwQueryProfile = { ...SEND_API_GW_PROFILE, id: 'custom' };
    const resolved = resolveApiGwQueryProfile(baseConfig({ queryProfile: custom }));
    assert.strictEqual(resolved.id, 'custom');
  });

  it('returns SEND_API_GW_PROFILE as default when queryProfile is not set', () => {
    const resolved = resolveApiGwQueryProfile(baseConfig());
    assert.strictEqual(resolved.id, 'send');
    assert.strictEqual(resolved.accessLog.query, SEND_API_GW_PROFILE.accessLog.query);
  });
});
