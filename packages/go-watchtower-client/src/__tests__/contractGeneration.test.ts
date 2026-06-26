import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

interface GenerationLock {
  readonly artifacts: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
}

interface UpstreamManifest {
  readonly ownerRepository: 'go-watchtower';
  readonly artifacts: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
}

describe('WT generated contract lock', () => {
  it('rejects source or generated type drift', async () => {
    const packageRoot = resolve(import.meta.dirname, '../..');
    const lock = JSON.parse(
      await readFile(resolve(packageRoot, 'watchtower-client-generation-lock.json'), 'utf8'),
    ) as GenerationLock;

    for (const artifact of lock.artifacts) {
      const bytes = await readFile(resolve(packageRoot, artifact.path));
      assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, artifact.path);
    }
  });

  it('verifies every vendored artifact against the WT manifest', async () => {
    const upstreamRoot = resolve(
      import.meta.dirname,
      '../../../../contracts/runbook-automation/v1/upstream/go-watchtower',
    );
    const manifest = JSON.parse(
      await readFile(resolve(upstreamRoot, 'watchtower-contract-manifest.json'), 'utf8'),
    ) as UpstreamManifest;
    assert.strictEqual(manifest.ownerRepository, 'go-watchtower');

    for (const artifact of manifest.artifacts) {
      const bytes = await readFile(resolve(upstreamRoot, artifact.path));
      assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, artifact.path);
    }
  });
});
