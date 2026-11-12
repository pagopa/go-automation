import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GODeploymentMode } from '../../environment/GODeploymentMode.js';
import { GOExecutionEnvironment } from '../../environment/GOExecutionEnvironment.js';
import { GOScript } from '../GOScript.js';

describe('GOScript paths.rootDir option', () => {
  it('roots paths and environment at the explicit directory without changing global detection', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-script-root-'));
    try {
      const script = new GOScript({
        metadata: { name: 'Rooted Script', version: '1.0.0', description: 'rooted', authors: ['test'] },
        logging: { console: false, file: false },
        paths: { rootDir: root },
      });

      assert.strictEqual(script.paths.getProjectRoot(), root);
      assert.strictEqual(script.environment.deploymentMode, GODeploymentMode.MONOREPO);
      assert.strictEqual(script.environment.monorepoRoot, root);
      assert.notStrictEqual(GOExecutionEnvironment.detect().monorepoRoot, root);
      assert.strictEqual(process.env['GO_ROOT_DIR'], undefined);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
