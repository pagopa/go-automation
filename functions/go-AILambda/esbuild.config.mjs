/**
 * esbuild config for go-AILambda
 *
 * Bundles handler + @go-automation/go-ai into a single ESM file.
 * yaml is bundled (not available in Lambda runtime).
 * @aws-sdk/* is external (available in Lambda runtime Node 20+).
 * prompts.yaml is copied alongside the bundle.
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

const MONOREPO_ROOT = path.resolve('..', '..');
const ARTIFACT_DIR  = path.join(MONOREPO_ROOT, 'artifacts', 'go-AILambda');
const PROMPTS_SRC   = path.join(MONOREPO_ROOT, 'packages', 'go-ai', 'prompts.yaml');

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
  // yaml must be bundled — not available in Lambda runtime
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});

// Copy prompts.yaml alongside the bundle
// The loader resolves it relative to handler.mjs at runtime
await fs.copyFile(PROMPTS_SRC, path.join(ARTIFACT_DIR, 'prompts.yaml'));

console.log(`✅ go-AILambda built → ${ARTIFACT_DIR}`);
