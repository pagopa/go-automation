import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import type {
  ExecuteRunbookQueueRegistryEntryV1,
  ExecuteRunbookQueueRegistryRevisionPayloadV1,
  ExecuteRunbookQueueRegistryV1,
} from '../ExecuteRunbookQueueRegistryV1.js';
import {
  buildQueueRegistry,
  canonicalizeQueueRegistryPayload,
  validateQueueRegistry,
} from '../queueRegistryRevision.js';

const CONTRACT_ROOT = new URL('../../../../contracts/runbook-automation/v1/', import.meta.url);
const PUBLISHED_AT = '2026-06-22T00:00:00.000Z';

function queueEntry(name = 'go-execute-runbook'): ExecuteRunbookQueueRegistryEntryV1 {
  return {
    queueUrl: `https://sqs.eu-south-1.amazonaws.com/123456789012/${name}.fifo`,
    queueArn: `arn:aws:sqs:eu-south-1:123456789012:${name}.fifo`,
    stackName: name,
    messageRetentionSeconds: 345600,
  };
}

describe('ExecuteRunbookQueueRegistryV1', () => {
  it('calculates a deterministic revision regardless of object insertion order', () => {
    const first = buildQueueRegistry({
      schemaVersion: 1,
      publishedAt: PUBLISHED_AT,
      queues: { 'eu-south-1': queueEntry() },
    });

    assert.strictEqual(
      canonicalizeQueueRegistryPayload({
        queues: first.queues,
        publishedAt: first.publishedAt,
        schemaVersion: first.schemaVersion,
      }),
      canonicalizeQueueRegistryPayload({
        schemaVersion: first.schemaVersion,
        publishedAt: first.publishedAt,
        queues: first.queues,
      }),
    );
    assert.doesNotThrow(() => validateQueueRegistry(first));
  });

  it('sorts canonical object keys by Unicode code point, not locale or UTF-16 order', () => {
    const privateUse = '';
    const supplementary = '\u{10000}';
    const payload = {
      schemaVersion: 1,
      publishedAt: PUBLISHED_AT,
      queues: { [supplementary]: queueEntry(), [privateUse]: queueEntry() },
    } as ExecuteRunbookQueueRegistryRevisionPayloadV1;

    const canonical = JSON.parse(canonicalizeQueueRegistryPayload(payload)) as {
      readonly queues: Record<string, unknown>;
    };

    assert.deepStrictEqual(Object.keys(canonical.queues), [privateUse, supplementary]);
  });

  it('accepts the valid and missing-region fixtures and rejects the invalid revision fixture', async () => {
    const valid = await fixture('fixtures/queue-registry.valid.json');
    const invalid = await fixture('fixtures/queue-registry.invalid-revision.json');
    const missingRegion = await fixture('fixtures/queue-registry.missing-region.json');

    assert.doesNotThrow(() => validateQueueRegistry(valid));
    assert.throws(() => validateQueueRegistry(invalid), /revision/);
    // A missing region is a valid registry, distinct from an invalid one.
    assert.doesNotThrow(() => validateQueueRegistry(missingRegion));
    assert.strictEqual(missingRegion.queues['eu-south-1'], undefined);
  });

  it('rejects resource names that are not the fixed worker names', () => {
    assert.throws(
      () =>
        buildQueueRegistry({
          schemaVersion: 1,
          publishedAt: PUBLISHED_AT,
          queues: { 'eu-south-1': queueEntry('go-execute-runbook-production-eu-south-1') },
        }),
      /Queue URL/,
    );
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
