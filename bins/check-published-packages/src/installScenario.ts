import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { PackageManager } from './types/PackageManager.js';

/** Public registry for the third-party packages: a scenario never reads the user's or the repo's registry settings. */
const PUBLIC_REGISTRY = 'https://registry.npmjs.org/';

/**
 * Creates an empty consumer project that depends on the scenario packages and peers, and installs it
 * with `engine-strict`, so a scenario fails on a Node version the manifests do not support.
 *
 * - Only the scenario packages and the peers are **direct** dependencies; the other published
 *   packages are reached through the manifests, so a missing dependency edge is not hidden.
 * - **npm**: hoisted layout, optional peers are not installed automatically.
 * - **pnpm**: isolated linker, no public **and** no hidden hoisting, so an undeclared import cannot
 *   resolve by accident.
 *
 * Every `@pagopa/*` package is forced to its tarball with overrides, never fetched.
 *
 * @param directory - Empty directory of the project
 * @param direct - Published packages the scenario depends on directly
 * @param tarballs - Tarball of every published package the scenario may reach
 * @param peers - Version of each peer package to install
 * @param manager - Installer
 */
export async function installScenario(
  directory: string,
  direct: ReadonlyArray<string>,
  tarballs: ReadonlyMap<string, string>,
  peers: ReadonlyMap<string, string>,
  manager: PackageManager,
): Promise<void> {
  const local = Object.fromEntries([...tarballs].map(([name, tarball]) => [name, `file:${tarball}`]));
  const directLocal = Object.fromEntries(direct.map((name) => [name, local[name] ?? '']));
  const manifest = {
    name: `smoke-${path
      .basename(directory)
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/gu, '-')}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    dependencies: { ...directLocal, ...Object.fromEntries(peers) },
    ...(manager === 'npm' ? { overrides: local } : {}),
  };
  await fs.writeFile(path.join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(directory, '.npmrc'), `registry=${PUBLIC_REGISTRY}\n`);
  if (manager === 'pnpm') {
    // pnpm reads overrides and linker settings from pnpm-workspace.yaml, not from package.json.
    await fs.writeFile(path.join(directory, 'pnpm-workspace.yaml'), pnpmWorkspace(local));
  }
  const args =
    manager === 'npm'
      ? ['install', '--no-audit', '--no-fund', '--engine-strict', '--no-package-lock']
      : [
          'install',
          '--config.node-linker=isolated',
          '--config.public-hoist-pattern=',
          '--config.hoist-pattern=',
          '--config.engine-strict=true',
          '--config.auto-install-peers=false',
        ];
  execFileSync(manager, args, { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

/** Settings of the pnpm scenario: tarball overrides, isolated linker, no hoisting, strict engines. */
function pnpmWorkspace(local: Readonly<Record<string, string>>): string {
  return [
    'nodeLinker: isolated',
    'publicHoistPattern: []',
    'hoistPattern: []',
    'engineStrict: true',
    'autoInstallPeers: false',
    'minimumReleaseAge: 0',
    'overrides:',
    ...Object.entries(local).map(([name, spec]) => `  '${name}': '${spec}'`),
    '',
  ].join('\n');
}
