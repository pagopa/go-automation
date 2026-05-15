import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import type { ApiGwAlarmConfig } from '../../types/ApiGwAlarmConfig.js';
import {
  resolveApiGwQueryProfile,
  resetQueryTemplatesDeprecationWarningForTests,
} from '../resolveApiGwQueryProfile.js';
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
  beforeEach(() => {
    resetQueryTemplatesDeprecationWarningForTests();
  });

  it('returns the explicit queryProfile when provided', () => {
    const custom: ApiGwQueryProfile = { ...SEND_API_GW_PROFILE, id: 'custom' };
    const resolved = resolveApiGwQueryProfile(baseConfig({ queryProfile: custom }));
    assert.strictEqual(resolved.id, 'custom');
  });

  it('returns SEND_API_GW_PROFILE as default when neither queryProfile nor queryTemplates are set', () => {
    const resolved = resolveApiGwQueryProfile(baseConfig());
    assert.strictEqual(resolved.id, 'send');
    assert.strictEqual(resolved.accessLog.query, SEND_API_GW_PROFILE.accessLog.query);
  });

  it('merges legacy queryTemplates onto SEND profile when queryTemplates only', () => {
    const warnSpy = mock.method(console, 'warn', () => {});
    try {
      const resolved = resolveApiGwQueryProfile(
        baseConfig({ queryTemplates: { apiGwQuery: 'filter status >= {{minStatusCode}}' } }),
      );
      assert.strictEqual(resolved.accessLog.query, 'filter status >= {{minStatusCode}}');
      assert.strictEqual(resolved.serviceLog.queryTemplate, SEND_API_GW_PROFILE.serviceLog.queryTemplate);
    } finally {
      warnSpy.mock.restore();
    }
  });

  it('preserves SEND.serviceLog.queryTemplate when legacy only overrides apiGwQuery', () => {
    const warnSpy = mock.method(console, 'warn', () => {});
    try {
      const resolved = resolveApiGwQueryProfile(baseConfig({ queryTemplates: { apiGwQuery: 'x{{minStatusCode}}' } }));
      assert.strictEqual(resolved.serviceLog.queryTemplate, SEND_API_GW_PROFILE.serviceLog.queryTemplate);
    } finally {
      warnSpy.mock.restore();
    }
  });

  it('throws when both queryProfile and queryTemplates are set', () => {
    assert.throws(
      () =>
        resolveApiGwQueryProfile(
          baseConfig({
            queryProfile: SEND_API_GW_PROFILE,
            queryTemplates: { apiGwQuery: 'x' },
          }),
        ),
      /both `queryProfile` and `queryTemplates` are set/,
    );
  });

  describe('deprecation warning', () => {
    it('emits warning on first call with queryTemplates', () => {
      const warnSpy = mock.method(console, 'warn', () => {});
      try {
        resolveApiGwQueryProfile(baseConfig({ queryTemplates: { apiGwQuery: 'x{{minStatusCode}}' } }));
        assert.strictEqual(warnSpy.mock.callCount(), 1);
      } finally {
        warnSpy.mock.restore();
      }
    });

    it('does NOT emit a second warning in the same process unless reset', () => {
      const warnSpy = mock.method(console, 'warn', () => {});
      try {
        resolveApiGwQueryProfile(baseConfig({ queryTemplates: { apiGwQuery: 'x{{minStatusCode}}' } }));
        resolveApiGwQueryProfile(baseConfig({ queryTemplates: { apiGwQuery: 'x{{minStatusCode}}' } }));
        assert.strictEqual(warnSpy.mock.callCount(), 1);
      } finally {
        warnSpy.mock.restore();
      }
    });

    it('emits warning again after reset (validates the reset helper)', () => {
      const warnSpy = mock.method(console, 'warn', () => {});
      try {
        resolveApiGwQueryProfile(baseConfig({ queryTemplates: { apiGwQuery: 'x{{minStatusCode}}' } }));
        resetQueryTemplatesDeprecationWarningForTests();
        resolveApiGwQueryProfile(baseConfig({ queryTemplates: { apiGwQuery: 'x{{minStatusCode}}' } }));
        assert.strictEqual(warnSpy.mock.callCount(), 2);
      } finally {
        warnSpy.mock.restore();
      }
    });

    it('does not emit warning when queryProfile is used', () => {
      const warnSpy = mock.method(console, 'warn', () => {});
      try {
        resolveApiGwQueryProfile(baseConfig({ queryProfile: SEND_API_GW_PROFILE }));
        assert.strictEqual(warnSpy.mock.callCount(), 0);
      } finally {
        warnSpy.mock.restore();
      }
    });

    it('does not emit warning on the no-config-default path (case 4)', () => {
      const warnSpy = mock.method(console, 'warn', () => {});
      try {
        resolveApiGwQueryProfile(baseConfig());
        assert.strictEqual(warnSpy.mock.callCount(), 0);
      } finally {
        warnSpy.mock.restore();
      }
    });
  });
});
