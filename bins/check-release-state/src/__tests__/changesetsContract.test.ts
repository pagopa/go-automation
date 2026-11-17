import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

/**
 * Contract with the pinned Changesets CLI: runs the real `changeset` binary
 * with the repository configuration on a copy of the published manifests, outside any git repository
 * (`version` with `commit: false` does not use git). It protects the behaviours the release flow
 * depends on, including the experimental `updateInternalDependents: "always"` option.
 */
const REPOSITORY = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const CHANGESET_BIN = path.join(REPOSITORY, 'node_modules', '@changesets', 'cli', 'bin.js');
const PUBLISHED = ['go-common', 'go-aws', 'go-runbook'];

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}

describe('Changesets contract (pinned CLI + repository configuration)', () => {
  let workspace = '';

  const changeset = (...args: ReadonlyArray<string>): void => {
    const result = spawnSync(process.execPath, [CHANGESET_BIN, ...args], { cwd: workspace, encoding: 'utf8' });
    assert.strictEqual(result.status, 0, `changeset ${args.join(' ')}: ${result.stderr}${result.stdout}`);
  };
  const version = async (directory: string): Promise<unknown> =>
    (await readJson(path.join(workspace, 'packages', directory, 'package.json')))['version'];
  const setVersions = async (value: string): Promise<void> => {
    for (const directory of PUBLISHED) {
      const file = path.join(workspace, 'packages', directory, 'package.json');
      await fs.writeFile(file, JSON.stringify({ ...(await readJson(file)), version: value }, null, 2));
    }
  };

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'changesets-contract-'));
    await fs.writeFile(path.join(workspace, 'package.json'), '{ "name": "contract-root", "private": true }\n');
    await fs.writeFile(path.join(workspace, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    for (const directory of PUBLISHED) {
      await fs.mkdir(path.join(workspace, 'packages', directory), { recursive: true });
      await fs.copyFile(
        path.join(REPOSITORY, 'packages', directory, 'package.json'),
        path.join(workspace, 'packages', directory, 'package.json'),
      );
    }
    const config = await readJson(path.join(REPOSITORY, '.changeset', 'config.json'));
    await fs.mkdir(path.join(workspace, '.changeset'));
    // Same configuration, without the GitHub changelog (network) and the formatter.
    await fs.writeFile(
      path.join(workspace, '.changeset', 'config.json'),
      JSON.stringify({ ...config, changelog: false, format: false }),
    );
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('bootstraps the three packages to 1.0.0-next.0 and keeps the workspace ranges', async () => {
    await setVersions('0.0.0');
    // Same content as the bootstrap changeset of §9.2, generated here: the real one is consumed by the
    // first release.
    await fs.writeFile(
      path.join(workspace, '.changeset', 'initial-release.md'),
      "---\n'@pagopa/go-common': major\n'@pagopa/go-aws': major\n'@pagopa/go-runbook': major\n---\n\nFirst release.\n",
    );
    changeset('pre', 'enter', 'next');
    changeset('version');
    for (const directory of PUBLISHED) assert.strictEqual(await version(directory), '1.0.0-next.0');
    const runbook = await readJson(path.join(workspace, 'packages', 'go-runbook', 'package.json'));
    assert.deepStrictEqual(
      runbook['dependencies'],
      (await readJson(path.join(REPOSITORY, 'packages', 'go-runbook', 'package.json')))['dependencies'],
    );
    // Changesets 3 moves the consumed changeset under .changeset/pre/ in pre mode.
    await fs.access(path.join(workspace, '.changeset', 'pre', 'initial-release.md'));
  });

  it('propagates a patch of go-common to its dependents after 1.0.0 (§9.2)', async () => {
    await setVersions('1.0.0');
    await fs.writeFile(path.join(workspace, '.changeset', 'fix.md'), "---\n'@pagopa/go-common': patch\n---\n\nFix.\n");
    changeset('version');
    for (const directory of PUBLISHED) assert.strictEqual(await version(directory), '1.0.1');
  });

  it('reads a lowercase agents.md as a changeset (only README.md is case-insensitive)', async () => {
    await setVersions('1.0.0');
    await fs.writeFile(path.join(workspace, '.changeset', 'agents.md'), "---\n'@pagopa/go-common': patch\n---\n\nX.\n");
    changeset('version');
    assert.strictEqual(await version('go-common'), '1.0.1');
  });

  it('ignores hidden and reserved changeset names, like the guard does', async () => {
    await setVersions('1.0.0');
    for (const name of ['.hidden.md', 'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'readme.md']) {
      await fs.writeFile(path.join(workspace, '.changeset', name), "---\n'@pagopa/go-common': patch\n---\n\nX.\n");
    }
    const result = spawnSync(process.execPath, [CHANGESET_BIN, 'version'], { cwd: workspace, encoding: 'utf8' });
    assert.notStrictEqual(result.status, 0, 'no changeset must be found');
    assert.match(`${result.stdout}${result.stderr}`, /No unreleased changesets/u);
    assert.strictEqual(await version('go-common'), '1.0.0');
  });
});
