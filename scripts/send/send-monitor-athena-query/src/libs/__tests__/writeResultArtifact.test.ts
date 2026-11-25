import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { GOPaths } from '@go-automation/go-script';

import { writeResultArtifact } from '../writeResultArtifact.js';
import { createConfig } from './helpers/createConfig.js';

describe('writeResultArtifact', () => {
  it('sanitizes file prefix without regex trimming', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'athena-artifact-'));

    try {
      const artifact = await writeResultArtifact(
        [{ id: '1' }],
        createConfig({
          outputFolder: outputDir,
          outputFilePrefix: '---bad prefix !! name---',
        }),
        new GOPaths({ scriptName: 'send-monitor-athena-query', baseDir: outputDir }),
      );

      assert.match(artifact.fileName, /^bad-prefix-name_/);
      assert.strictEqual(path.dirname(artifact.filePath), outputDir);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
