import * as esbuild from 'esbuild';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MONOREPO_ROOT = path.resolve('..', '..');
const ARTIFACT_DIR = path.join(MONOREPO_ROOT, 'artifacts', 'go-ExecuteRunbookLambda');

await fs.rm(ARTIFACT_DIR, { recursive: true, force: true });
await fs.mkdir(ARTIFACT_DIR, { recursive: true });

await esbuild.build({
  entryPoints: ['src/handler.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  outfile: path.join(ARTIFACT_DIR, 'handler.mjs'),
  format: 'esm',
  sourcemap: true,
  minify: false,
  banner: {
    js: "import { createRequire as __banner_createRequire } from 'node:module'; const require = __banner_createRequire(import.meta.url);",
  },
});

console.log(`go-ExecuteRunbookLambda built -> ${ARTIFACT_DIR}`);
