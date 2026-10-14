/* eslint-disable security/detect-non-literal-fs-filename -- temporary file fixtures for real hash verification */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { verifyFileHashes } from '../verifyFileHashes.js';

describe('verifyFileHashes', () => {
  it('accepts equal NDJSON content and fails on different content or a missing object', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'audit-hash-test-'));
    const extracted = join(directory, 'extracted.ndjson');
    const original = join(directory, 'original.ndjson');
    try {
      await writeFile(extracted, '{"token":"same"}\n');
      await writeFile(original, '{"token":"same"}\n');
      const hashes = await verifyFileHashes(extracted, original);
      assert.strictEqual(hashes.hashExtracted, hashes.hashOriginal);
      assert.match(hashes.hashOriginal, /^[a-f0-9]{64}$/u);

      await writeFile(original, '{"token":"different"}\n');
      await assert.rejects(verifyFileHashes(extracted, original), /Hash verification failed!.*contents differ/u);
      await assert.rejects(verifyFileHashes(extracted, join(directory, 'missing.ndjson')), /ENOENT/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
