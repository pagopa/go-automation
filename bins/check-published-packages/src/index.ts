import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { nodeMatrix } from './nodeMatrix.js';
import { packPublishedPackages, readPackedPackages, readPublishedManifests } from './packPublishedPackages.js';
import { readCatalogVersions } from './readCatalogVersions.js';
import { runScenario } from './runScenario.js';
import { buildScenarios, uncoveredSubpaths } from './scenarios.js';
import type { PackageManager } from './types/PackageManager.js';
import type { PackedPackage } from './types/PackedPackage.js';
import type { ScenarioResult } from './types/ScenarioResult.js';
import type { SmokeScenario } from './types/SmokeScenario.js';

const MANAGERS: ReadonlyArray<PackageManager> = ['npm', 'pnpm'];

function optionValue(argv: ReadonlyArray<string>, option: string): string | undefined {
  const index = argv.indexOf(option);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

/** `S4` selects the whole S4 group; an id with a suffix (`S4-cloudwatch-logs`) selects only itself. */
function selects(selector: string, scenarioId: string): boolean {
  return scenarioId === selector || (!selector.includes('-') && scenarioId.startsWith(`${selector}-`));
}

function scenariosOf(packages: ReadonlyMap<string, PackedPackage>): ReadonlyArray<SmokeScenario> {
  return buildScenarios(
    packages.get('@pagopa/go-common')?.subpaths ?? [],
    packages.get('@pagopa/go-runbook')?.subpaths ?? [],
  );
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const root = path.resolve(optionValue(argv, '--root') ?? process.cwd());
  const only = optionValue(argv, '--scenario')
    ?.split(',')
    .map((id) => id.trim());
  const managerOption = optionValue(argv, '--manager');
  const managers = managerOption === undefined ? MANAGERS : MANAGERS.filter((manager) => manager === managerOption);
  if (managers.length === 0) throw new Error('--manager must be npm or pnpm');
  const keep = argv.includes('--keep');
  const packTo = optionValue(argv, '--pack-to');
  const fromTarballs = optionValue(argv, '--from-tarballs');

  if (argv.includes('--print-node-matrix')) {
    // CI: the cells of the smoke matrix, derived from the declared engines of each scenario (§10.2).
    const manifests = new Map((await readPublishedManifests(root)).map((entry) => [entry.name, entry]));
    console.log(JSON.stringify(nodeMatrix(scenariosOf(manifests), manifests)));
    return 0;
  }

  if (packTo !== undefined) {
    // CI packing job: build and pack once on the toolchain Node, then hand the archives to the matrix.
    const destination = path.resolve(packTo);
    await fs.mkdir(destination, { recursive: true });
    const packed = await packPublishedPackages(root, destination);
    console.log(`Packed ${packed.map((entry) => path.basename(entry.tarball)).join(', ')} into ${destination}`);
    return 0;
  }

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'published-packages-'));
  try {
    const tarballs = path.join(work, 'tarballs');
    await fs.mkdir(tarballs);
    const packedList =
      fromTarballs === undefined
        ? await packPublishedPackages(root, tarballs)
        : await readPackedPackages(path.resolve(fromTarballs));
    const packed = new Map(packedList.map((entry) => [entry.name, entry]));
    const scenarios = scenariosOf(packed);
    const uncovered = uncoveredSubpaths(new Map([...packed].map(([name, entry]) => [name, entry.subpaths])), scenarios);
    if (uncovered.length > 0) {
      console.error(
        `Published subpaths without a scenario: ${uncovered.join(', ')} (bins/check-published-packages/src/scenarios.ts)`,
      );
      return 1;
    }
    const selected = scenarios.filter((scenario) => only === undefined || only.some((id) => selects(id, scenario.id)));
    const unmatched = (only ?? []).filter((id) => !scenarios.some((scenario) => selects(id, scenario.id)));
    if (unmatched.length > 0 || selected.length === 0) {
      // A cell that selects nothing must not pass with zero runs.
      console.error(`No scenario matches: ${unmatched.length > 0 ? unmatched.join(', ') : '(empty selection)'}`);
      return 1;
    }
    const context = {
      repositoryRoot: root,
      workRoot: work,
      packed,
      catalog: await readCatalogVersions(path.join(root, 'pnpm-workspace.yaml')),
    };
    const results: ScenarioResult[] = [];
    for (const scenario of selected) {
      for (const manager of managers) {
        const result = await runScenario(scenario, manager, context);
        results.push(result);
        const status = result.failures.length === 0 ? 'ok  ' : 'FAIL';
        console.log(
          `${status} ${scenario.id} (${manager})${result.notes.length > 0 ? ` — ${result.notes.join(', ')}` : ''}`,
        );
        for (const failure of result.failures) console.log(`       ${failure}`);
      }
    }
    const failed = results.filter((result) => result.failures.length > 0);
    console.log(
      `\n${String(results.length - failed.length)}/${String(results.length)} scenario runs passed on Node ${process.versions.node}.`,
    );
    return failed.length === 0 ? 0 : 1;
  } finally {
    if (keep) console.log(`Kept ${work}`);
    else await fs.rm(work, { recursive: true, force: true });
  }
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
