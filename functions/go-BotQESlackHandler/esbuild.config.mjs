/**
 * esbuild config for go-BotQESlackHandler
 * Tiny bundle — only @aws-sdk/client-lambda (external in runtime).
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

const MONOREPO_ROOT = path.resolve('..', '..');
const ARTIFACT_DIR  = path.join(MONOREPO_ROOT, 'artifacts', 'go-BotQESlackHandler');

await fs.rm(ARTIFACT_DIR, { recursive: true, force: true });
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: ['src/handler.ts'],
  bundle:      true,
  platform:    'node',
  target:      'node20',
  outfile:     path.join(ARTIFACT_DIR, 'handler.mjs'),
  format:      'esm',
  sourcemap:   true,
  minify:      false,
  external:    ['@aws-sdk/*'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

console.log(`✅ go-BotQESlackHandler built → ${ARTIFACT_DIR}`);
