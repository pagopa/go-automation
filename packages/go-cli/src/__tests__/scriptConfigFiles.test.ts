import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { findScriptConfigFiles } from '../scriptConfigFiles.js';

async function createFile(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, '');
}

describe('findScriptConfigFiles', () => {
  it('finds only configs in the supported category/script layout', async (context) => {
    const scriptsDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'go-cli-discovery-'));
    context.after(async () => fs.rm(scriptsDirectory, { recursive: true, force: true }));

    const expectedConfigFiles = [
      path.join(scriptsDirectory, 'aws', 'aws-check-ecs', 'src', 'config.ts'),
      path.join(scriptsDirectory, 'go', 'go-report-alarms', 'src', 'config.ts'),
    ];

    await Promise.all([
      ...expectedConfigFiles.map(createFile),
      createFile(path.join(scriptsDirectory, 'go', 'missing-config', 'src', 'index.ts')),
      createFile(path.join(scriptsDirectory, 'go', 'go-report-alarms', 'nested', 'src', 'config.ts')),
      createFile(path.join(scriptsDirectory, 'src', 'config.ts')),
      createFile(path.join(scriptsDirectory, 'README.md')),
    ]);

    assert.deepStrictEqual(await findScriptConfigFiles(scriptsDirectory), expectedConfigFiles);
  });
});
