import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { composeQueueRegistry, publishQueueRegistry } from '../registry/publishQueueRegistry.js';
import type { ExecuteRunbookQueueRegistryFragmentV1 } from '../registry/publishQueueRegistry.js';

function fragment(region: string): ExecuteRunbookQueueRegistryFragmentV1 {
  return {
    awsRegion: region,
    queueUrl: `https://sqs.${region}.amazonaws.com/170533023216/go-execute-runbook-production-${region}.fifo`,
    queueArn: `arn:aws:sqs:${region}:170533023216:go-execute-runbook-production-${region}.fifo`,
    stackName: `go-execute-runbook-production-${region}`,
    messageRetentionSeconds: 345600,
  };
}

describe('publish execute-runbook queue registry', () => {
  it('composes all expected regions and atomically publishes one JSON value', async () => {
    const registry = composeQueueRegistry(
      ['eu-south-1', 'eu-west-1'],
      [fragment('eu-west-1'), fragment('eu-south-1')],
      '2026-06-22T00:00:00.000Z',
    );
    const writes: { name: string; value: string }[] = [];
    await publishQueueRegistry('/go-automation/production/execute-runbook/queue-registry-v1', registry, {
      async put(name, value) {
        writes.push({ name, value });
        await Promise.resolve();
      },
    });
    assert.strictEqual(writes.length, 1);
    assert.deepStrictEqual(Object.keys(registry.queues).sort(), ['eu-south-1', 'eu-west-1']);
    assert.strictEqual(parseRevision(writes[0]?.value ?? '{}'), registry.revision);
  });

  it('rejects missing and duplicate regional fragments', () => {
    assert.throws(
      () => composeQueueRegistry(['eu-south-1', 'eu-west-1'], [fragment('eu-south-1')], new Date().toISOString()),
      /Missing queue registry regions/,
    );
    assert.throws(
      () =>
        composeQueueRegistry(
          ['eu-south-1'],
          [fragment('eu-south-1'), fragment('eu-south-1')],
          new Date().toISOString(),
        ),
      /Duplicate queue registry region/,
    );
  });
});

function parseRevision(value: string): unknown {
  const parsed: unknown = JSON.parse(value);
  return typeof parsed === 'object' && parsed !== null && 'revision' in parsed ? parsed.revision : undefined;
}
