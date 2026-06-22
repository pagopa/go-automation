import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWS } from '@go-automation/go-common';

import { formatCleanupWarnings } from '../formatCleanupWarnings.js';

describe('formatCleanupWarnings', () => {
  it('respects the Watchtower maximum item count and item length', () => {
    const warnings: AWS.AWSRemoteCleanupWarning[] = Array.from({ length: 40 }, (_, index) => ({
      service: index % 2 === 0 ? 'LOGS' : 'ATHENA',
      operationId: `query-${index}`,
      code: 'REMOTE_QUERY_STOP_FAILED',
      message: `failure-${index}-${'x'.repeat(200)}`,
    }));

    const result = formatCleanupWarnings(warnings);

    assert.strictEqual(result.length, 32);
    assert.ok(result.every((warning) => warning.length <= 100));
    assert.strictEqual(result[0], `LOGS:REMOTE_QUERY_STOP_FAILED:failure-0-${'x'.repeat(200)}`.slice(0, 100));
  });
});
