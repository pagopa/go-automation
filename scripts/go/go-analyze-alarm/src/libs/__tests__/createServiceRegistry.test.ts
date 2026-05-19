import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createServiceRegistry } from '../createServiceRegistry.js';

describe('createServiceRegistry', () => {
  it('uses the generic Athena service from the script AWS provider', () => {
    const cloudWatchLogs = {};
    const cloudWatchMetrics = {};
    const athena = {};
    const dynamoDB = {};

    const script = {
      aws: {
        services: {
          cloudWatchLogs,
          cloudWatchMetrics,
          athena,
          dynamoDB,
        },
      },
    } as unknown as Parameters<typeof createServiceRegistry>[0];

    const registry = createServiceRegistry(script);

    assert.strictEqual(registry.cloudWatchLogs, cloudWatchLogs);
    assert.strictEqual(registry.cloudWatchMetrics, cloudWatchMetrics);
    assert.strictEqual(registry.athena, athena);
    assert.strictEqual(registry.dynamodb, dynamoDB);
  });
});
