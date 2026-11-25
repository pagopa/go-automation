import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';

import { listEntrypoints } from './listEntrypoints.js';
import { probeValueExports } from './probeValueExports.js';
import { exportedNames, finalizeReports, renderApiReport } from './renderApiReport.js';
import type { PublishedEntrypoint } from './types/PublishedEntrypoint.js';

/** Folder of the versioned reports inside each published package. */
const REPORT_FOLDER = 'api';

/** Options of the report program and of the value probe: NodeNext, as consumers compile. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
};

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const update = argv.includes('--update');
  const root = path.resolve(process.cwd());
  const entrypoints = await listEntrypoints(root);
  const byPackage = new Map<string, PublishedEntrypoint[]>();
  for (const entrypoint of entrypoints) {
    const list = byPackage.get(entrypoint.packageName) ?? [];
    list.push(entrypoint);
    byPackage.set(entrypoint.packageName, list);
  }

  const outdated: string[] = [];
  for (const [packageName, packageEntrypoints] of byPackage) {
    const program = ts.createProgram(
      packageEntrypoints.map((entrypoint) => entrypoint.typesFile),
      COMPILER_OPTIONS,
    );
    const valueExports = probeValueExports(
      packageEntrypoints.map((entrypoint) => ({
        typesFile: entrypoint.typesFile,
        names: exportedNames(entrypoint, program),
      })),
      COMPILER_OPTIONS,
    );
    const reports = finalizeReports(
      packageEntrypoints.map((entrypoint, index) =>
        renderApiReport(entrypoint, program, valueExports[index] ?? new Set<string>()),
      ),
    );
    const [first] = packageEntrypoints;
    if (first === undefined) continue;
    const folder = path.join(first.packageDirectory, REPORT_FOLDER);
    const existing = new Set(
      (await fs.readdir(folder).catch(() => [] as string[])).filter((name) => name.endsWith('.api.md')),
    );
    for (const [fileName, text] of reports) {
      const file = path.join(folder, fileName);
      const current = await fs.readFile(file, 'utf8').catch(() => undefined);
      existing.delete(fileName);
      if (current === text) continue;
      if (update) {
        await fs.mkdir(folder, { recursive: true });
        await fs.writeFile(file, text);
        console.log(`updated ${path.relative(root, file)}`);
      } else {
        outdated.push(`${path.relative(root, file)} (${current === undefined ? 'missing' : 'changed'})`);
      }
    }
    for (const stale of existing) {
      const file = path.join(folder, stale);
      if (update) {
        await fs.rm(file);
        console.log(`removed ${path.relative(root, file)}`);
      } else {
        outdated.push(`${path.relative(root, file)} (no longer an entrypoint)`);
      }
    }
    if (!update) console.log(`${packageName}: ${String(reports.size)} entrypoints checked`);
  }
  if (outdated.length === 0) {
    if (!update) console.log('API reports are up to date.');
    return 0;
  }
  console.error(`API reports out of date:\n${outdated.map((item) => `- ${item}`).join('\n')}`);
  console.error('Review the change of the public surface, then run `pnpm api:report:update` and commit the reports.');
  return 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
