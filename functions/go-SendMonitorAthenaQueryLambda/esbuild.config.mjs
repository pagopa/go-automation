/**
 * esbuild configuration for go-SendMonitorAthenaQueryLambda
 *
 * Bundles the Lambda handler and the wrapped script into a single ESM file.
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

const MONOREPO_ROOT = path.resolve('..', '..');
const ARTIFACT_DIR = path.join(MONOREPO_ROOT, 'artifacts', 'go-SendMonitorAthenaQueryLambda');
const CONFIGS_SOURCE = path.join(MONOREPO_ROOT, 'scripts', 'send/send-monitor-athena-query', 'configs');
const CONFIGS_DEST = path.join(ARTIFACT_DIR, 'configs');

await fs.rm(ARTIFACT_DIR, { recursive: true, force: true });
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: ['src/handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(ARTIFACT_DIR, 'handler.mjs'),
  format: 'esm',
  sourcemap: true,
  minify: false,
  external: ['@aws-sdk/*'],
  banner: {
    js: "import { createRequire as __banner_createRequire } from 'module'; const require = __banner_createRequire(import.meta.url);",
  },
});

await fs.cp(CONFIGS_SOURCE, CONFIGS_DEST, {
  recursive: true,
  filter: (source) => path.basename(source) !== '.DS_Store',
});

console.log(`✅ go-SendMonitorAthenaQueryLambda built → ${ARTIFACT_DIR}`);
