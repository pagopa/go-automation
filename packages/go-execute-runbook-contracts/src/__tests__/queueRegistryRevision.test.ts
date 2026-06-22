import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import type { ExecuteRunbookQueueRegistryV1 } from '../ExecuteRunbookQueueRegistryV1.js';
import {
  buildQueueRegistry,
  canonicalizeQueueRegistryPayload,
  validateQueueRegistry,
} from '../queueRegistryRevision.js';

const CONTRACT_ROOT = new URL('../../../../contracts/runbook-automation/v1/', import.meta.url);

describe('ExecuteRunbookQueueRegistryV1', () => {
  it('calculates a deterministic revision regardless of object insertion order', () => {
    const first = buildQueueRegistry({
      schemaVersion: 1,
      publishedAt: '2026-06-22T00:00:00.000Z',
      queues: {
        'eu-south-1': {
          queueUrl: 'https://sqs.eu-south-1.amazonaws.com/170533023216/go-execute-runbook-production-eu-south-1.fifo',
          queueArn: 'arn:aws:sqs:eu-south-1:170533023216:go-execute-runbook-production-eu-south-1.fifo',
          stackName: 'go-execute-runbook-production-eu-south-1',
          messageRetentionSeconds: 345600,
        },
      },
    });
    const reordered = {
      queues: first.queues,
      publishedAt: first.publishedAt,
      schemaVersion: first.schemaVersion,
    } as const;

    assert.strictEqual(
      canonicalizeQueueRegistryPayload(reordered),
      canonicalizeQueueRegistryPayload({
        schemaVersion: first.schemaVersion,
        publishedAt: first.publishedAt,
        queues: first.queues,
      }),
    );
    assert.doesNotThrow(() => validateQueueRegistry(first));
  });

  it('accepts the valid handoff fixture and rejects the invalid revision fixture', async () => {
    const valid = await fixture('fixtures/queue-registry.valid.json');
    const invalid = await fixture('fixtures/queue-registry.invalid-revision.json');
    assert.doesNotThrow(() => validateQueueRegistry(valid));
    assert.throws(() => validateQueueRegistry(invalid), /revision/);
  });

  it('keeps missing-region distinct from an invalid registry', async () => {
    const registry = await fixture('fixtures/queue-registry.missing-region.json');
    assert.doesNotThrow(() => validateQueueRegistry(registry));
    assert.strictEqual(registry.queues['eu-south-1'], undefined);
  });

  it('keeps every manifest artifact hash in sync', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('go-automation-contract-manifest.json', CONTRACT_ROOT), 'utf8'),
    ) as {
      readonly artifacts: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
    };
    for (const artifact of manifest.artifacts) {
      const bytes = await readFile(
        new URL(artifact.path.replace('contracts/runbook-automation/v1/', ''), CONTRACT_ROOT),
      );
      assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, artifact.path);
    }
  });
});

async function fixture(path: string): Promise<ExecuteRunbookQueueRegistryV1> {
  return JSON.parse(await readFile(new URL(path, CONTRACT_ROOT), 'utf8')) as ExecuteRunbookQueueRegistryV1;
}
