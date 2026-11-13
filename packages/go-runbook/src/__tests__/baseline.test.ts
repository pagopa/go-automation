import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOJSONFileImporter } from '@pagopa/go-common/importers';

import {
  BASELINE_DIR,
  collectCanonicalRunbooks,
  collectDescriptors,
  collectFingerprints,
  collectSurface,
} from './baseline/collectBaseline.js';

/**
 * Reads a versioned baseline file.
 *
 * @param name - File name inside `src/__baseline__/`
 * @returns The parsed content
 */
async function readBaseline(name: string): Promise<unknown> {
  const data = await new GOJSONFileImporter({ inputPath: `${BASELINE_DIR}${name}` }).import();
  assert.notStrictEqual(data, undefined, `missing baseline file ${name}: run baseline:update`);
  return data;
}

/**
 * Normalizes computed values the same way they are stored (JSON round trip),
 * so readonly arrays and class-free objects compare structurally.
 *
 * @param value - Computed value
 * @returns The JSON round-tripped value
 */
function asStored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

// EVO-RBREORG-OPUS-01 §9.1: during the move phases these values must not change.
describe('go-runbook reorganization baseline', () => {
  it('keeps the published descriptors and digests', async () => {
    assert.deepStrictEqual(asStored(collectDescriptors()), await readBaseline('descriptors.json'));
  });

  it('keeps the canonical JSON of every built runbook', async () => {
    const stored = (await readBaseline('canonical.json')) as Record<string, unknown>;
    const current = asStored(collectCanonicalRunbooks()) as Record<string, unknown>;
    assert.deepStrictEqual(Object.keys(current).sort(), Object.keys(stored).sort());
    for (const key of Object.keys(stored)) {
      assert.deepStrictEqual(current[key], stored[key], `canonical runbook drift: ${key}`);
    }
  });

  it('keeps the RTA cache fingerprints', async () => {
    assert.deepStrictEqual(asStored(collectFingerprints()), await readBaseline('fingerprints.json'));
  });

  it('keeps the public surface of every entrypoint, namespace and class members included', async () => {
    assert.deepStrictEqual(asStored(collectSurface()), await readBaseline('surface.json'));
  });

  it('lists inherited public members, so losing a base class changes the surface', () => {
    const send = collectSurface()['./toolkits/send'] ?? [];

    assert.ok(send.includes('apigw.ApiGwServiceChainReporter#apiGwResult'));
    assert.ok(send.includes('apigw.ApiGwServiceChainReporter#stopSummary'));
  });
});
