/**
 * esbuild configuration for go-SendMonitorTppMessagesLambda
 *
 * Bundles the Lambda handler and all workspace dependencies into a single file.
 * AWS SDK packages are excluded (available in Lambda runtime).
 *
 * Output goes to artifacts/go-SendMonitorTppMessagesLambda/ at the monorepo root
 * to match the existing CI pipeline layout.
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

const MONOREPO_ROOT = path.resolve('..', '..');
const ARTIFACT_DIR = path.join(MONOREPO_ROOT, 'artifacts', 'go-SendMonitorTppMessagesLambda');
const CONFIGS_SOURCE = path.join(MONOREPO_ROOT, 'scripts', 'send', 'send-monitor-tpp-messages', 'configs');
const CONFIGS_DEST = path.join(ARTIFACT_DIR, 'configs');

/** Clean and recreate artifact directory */
await fs.rm(ARTIFACT_DIR, { recursive: true, force: true });
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

/** Bundle handler with esbuild */
await esbuild.build({
  entryPoints: ['src/handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(ARTIFACT_DIR, 'handler.mjs'),
  format: 'esm',
  sourcemap: true,
  minify: false,
  external: [
    '@aws-sdk/*',
  ],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

/** Copy configs directory alongside the bundle */
await fs.cp(CONFIGS_SOURCE, CONFIGS_DEST, { recursive: true });
