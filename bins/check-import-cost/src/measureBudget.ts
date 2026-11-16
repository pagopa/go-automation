import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';

import { packageOfInput, type ModuleGraph } from './evaluateBudget.js';

/**
 * Module graph of the given compiled entry files, from an esbuild metafile: deterministic and
 * independent of the machine.
 *
 * @param files - Compiled entry files
 * @returns Third-party packages and native modules of the graph
 */
export async function moduleGraph(files: ReadonlyArray<string>): Promise<ModuleGraph> {
  const result = await build({
    stdin: {
      contents: files.map((file) => `import ${JSON.stringify(file)};`).join('\n'),
      resolveDir: process.cwd(),
      loader: 'js',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    metafile: true,
    logLevel: 'error',
    outdir: 'unused',
  });
  const inputs = Object.keys(result.metafile.inputs);
  const thirdParty = new Set<string>();
  for (const input of inputs) {
    const name = packageOfInput(input);
    if (name !== undefined) thirdParty.add(name);
  }
  return { thirdParty: [...thirdParty].sort(), hasNativeModule: inputs.some((input) => input.endsWith('.node')) };
}

/** Prefix of the timing line: an imported module may print anything else on stdout. */
const TIMING_MARKER = 'GO_IMPORT_COST_MS=';

/**
 * The measured time from the probe output.
 *
 * @param stdout - Output of the probe process
 * @returns Milliseconds
 * @throws Error when the timing line is missing or not a finite, non-negative number
 */
export function parseTiming(stdout: string): number {
  const line = stdout.split('\n').find((candidate) => candidate.startsWith(TIMING_MARKER));
  const value = line === undefined ? Number.NaN : Number(line.slice(TIMING_MARKER.length));
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`no valid timing in the probe output: ${stdout.slice(0, 200)}`);
  return value;
}

/**
 * Median cold import time of the given files, each run in a fresh Node process.
 *
 * @param files - Compiled entry files, imported in order
 * @param runs - Number of runs
 * @returns Median in milliseconds
 * @throws Error when an import fails
 */
export function medianImportMilliseconds(files: ReadonlyArray<string>, runs: number): number {
  const imports = files.map((file) => `await import(${JSON.stringify(pathToFileURL(file).href)});`).join(' ');
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const start = performance.now(); ${imports} console.log('${TIMING_MARKER}' + (performance.now() - start));`,
      ],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(`import failed: ${result.stderr.trim().slice(0, 300)}`);
    samples.push(parseTiming(result.stdout));
  }
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
}
