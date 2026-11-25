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
    return { scenario: scenario.id, manager, failures: [`install failed: ${installFailure(error)}`], notes: [] };
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

/** Last lines of the installer output kept in the failure. */
const INSTALL_OUTPUT_LINES = 30;

/** The command, its exit status or signal and the last lines of both streams of a failed install. */
function installFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const field = (key: string): string => {
    const value: unknown = Reflect.get(error, key);
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  };
  const output = [field('stderr'), field('stdout')]
    .join('\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(-INSTALL_OUTPUT_LINES);
  const command = error.message.split('\n')[0] ?? error.message;
  const exit = `exit status ${field('status') || '-'}, signal ${field('signal') || '-'}`;
  return [`${command} (${exit})`, ...(output.length === 0 ? ['(no output)'] : output)]
    .map((line, index) => (index === 0 ? line : `         ${line}`))
    .join('\n');
}
