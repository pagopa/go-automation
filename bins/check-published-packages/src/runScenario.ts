import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { checkEngines } from './checkEngines.js';
import { checkImports } from './checkImports.js';
import { checkLambdaBundle } from './checkLambdaBundle.js';
import { checkTypes } from './checkTypes.js';
import { closeInternalDependencies } from './closeInternalDependencies.js';
import { installScenario } from './installScenario.js';
import type { PackageManager } from './types/PackageManager.js';
import type { PackedPackage } from './types/PackedPackage.js';
import type { ScenarioResult } from './types/ScenarioResult.js';
import type { SmokeScenario } from './types/SmokeScenario.js';

/** Inputs shared by every scenario run. */
export interface ScenarioRunContext {
  readonly repositoryRoot: string;
  readonly workRoot: string;
  readonly packed: ReadonlyMap<string, PackedPackage>;
  readonly catalog: ReadonlyMap<string, string>;
}

/**
 * Installs one scenario with one package manager and runs its checks: imports, types, engines and,
 * for S8, the pilot bundle.
 *
 * @param scenario - The scenario
 * @param manager - Installer
 * @param context - Packed tarballs, catalog versions and directories
 * @returns The failures and notes of the run
 */
export async function runScenario(
  scenario: SmokeScenario,
  manager: PackageManager,
  context: ScenarioRunContext,
): Promise<ScenarioResult> {
  const directory = path.join(context.workRoot, `${scenario.id}-${manager}`);
  await fs.mkdir(directory, { recursive: true });
  const packageNames = closeInternalDependencies(scenario.packages, context.packed);
  const published = packageNames.map((name) => {
    const entry = context.packed.get(name);
    if (entry === undefined) throw new Error(`${name} is not packed`);
    return entry;
  });
  const tarballs = new Map(published.map((entry) => [entry.name, entry.tarball]));
  const peers = new Map(
    scenario.peers.map((peer) => {
      const version = context.catalog.get(peer);
      if (version === undefined) throw new Error(`${peer} has no version in the pnpm catalog`);
      return [peer, version];
    }),
  );
  try {
    await installScenario(directory, scenario.packages, tarballs, peers, manager);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { scenario: scenario.id, manager, failures: [`install failed: ${message.slice(0, 400)}`], notes: [] };
  }
  const failures = [
    ...checkImports(directory, scenario.imports),
    ...(await checkTypes(directory, scenario.imports, context.repositoryRoot)),
    ...(await checkEngines(directory, scenario.packages, published)),
  ];
  const notes: string[] = [];
  if (scenario.lambdaBundle === true) {
    const bundle = await checkLambdaBundle(directory);
    failures.push(...bundle.failures);
    notes.push(...bundle.notes);
  }
  return { scenario: scenario.id, manager, failures, notes };
}
