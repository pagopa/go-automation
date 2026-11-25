import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';

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

/** A temporary workspace with the published manifests at one version and the repository configuration. */
class ContractWorkspace {
  private constructor(public readonly root: string) {}

  /**
   * Creates the workspace, setting every published package to `version`.
   *
   * @param version - The version written into the copied manifests
   */
  public static async create(version: string): Promise<ContractWorkspace> {
    const workspace = new ContractWorkspace(await fs.mkdtemp(path.join(os.tmpdir(), 'changesets-contract-')));
    await fs.writeFile(path.join(workspace.root, 'package.json'), '{ "name": "contract-root", "private": true }\n');
    await fs.writeFile(path.join(workspace.root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    for (const directory of PUBLISHED) {
      const manifest = await readJson(path.join(REPOSITORY, 'packages', directory, 'package.json'));
      await fs.mkdir(path.join(workspace.root, 'packages', directory), { recursive: true });
      await fs.writeFile(workspace.manifestPath(directory), JSON.stringify({ ...manifest, version }, null, 2));
    }
    const config = await readJson(path.join(REPOSITORY, '.changeset', 'config.json'));
    await fs.mkdir(path.join(workspace.root, '.changeset'));
    // Same configuration, without the GitHub changelog (network) and the formatter.
    await workspace.writeChangeset('config.json', JSON.stringify({ ...config, changelog: false, format: false }));
    return workspace;
  }

  /** Path of the manifest of a published package. */
  public manifestPath(directory: string): string {
    return path.join(this.root, 'packages', directory, 'package.json');
  }

  /** Writes a file under `.changeset/`. */
  public async writeChangeset(name: string, content: string): Promise<void> {
    await fs.writeFile(path.join(this.root, '.changeset', name), content);
  }

  /** Runs the pinned `changeset` CLI, returning its exit status and its whole output. */
  public async run(...args: ReadonlyArray<string>): Promise<{ readonly status: number; readonly output: string }> {
    return new Promise((resolve) => {
      execFile(process.execPath, [CHANGESET_BIN, ...args], { cwd: this.root }, (error, stdout, stderr) => {
        const status = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
        resolve({ status, output: `${stdout}${stderr}` });
      });
    });
  }

  /** Runs the pinned `changeset` CLI and fails the test on a non-zero exit. */
  public async changeset(...args: ReadonlyArray<string>): Promise<void> {
    const result = await this.run(...args);
    assert.strictEqual(result.status, 0, `changeset ${args.join(' ')}: ${result.output}`);
  }

  /** The version of every published package, by directory. */
  public async versions(): Promise<Readonly<Record<string, unknown>>> {
    const entries = await Promise.all(
      PUBLISHED.map(async (directory) => [directory, (await readJson(this.manifestPath(directory)))['version']]),
    );
    return Object.fromEntries(entries) as Readonly<Record<string, unknown>>;
  }
}

describe('Changesets contract (pinned CLI + repository configuration)', { concurrency: true }, () => {
  const workspaces: ContractWorkspace[] = [];
  const workspace = async (version: string): Promise<ContractWorkspace> => {
    const created = await ContractWorkspace.create(version);
    workspaces.push(created);
    return created;
  };

  after(async () => {
    await Promise.all(workspaces.map(async ({ root }) => fs.rm(root, { recursive: true, force: true })));
  });

  it('bootstraps the three packages to 1.0.0-next.0 and keeps the workspace ranges', async () => {
    const contract = await workspace('0.0.0');
    // Same content as the bootstrap changeset of §9.2, generated here: the real one is consumed by the
    // first release.
    await contract.writeChangeset(
      'initial-release.md',
      "---\n'@pagopa/go-common': major\n'@pagopa/go-aws': major\n'@pagopa/go-runbook': major\n---\n\nFirst release.\n",
    );
    await contract.changeset('pre', 'enter', 'next');
    await contract.changeset('version');
    assert.deepStrictEqual(await contract.versions(), {
      'go-common': '1.0.0-next.0',
      'go-aws': '1.0.0-next.0',
      'go-runbook': '1.0.0-next.0',
    });
    assert.deepStrictEqual(
      (await readJson(contract.manifestPath('go-runbook')))['dependencies'],
      (await readJson(path.join(REPOSITORY, 'packages', 'go-runbook', 'package.json')))['dependencies'],
    );
    // Changesets 3 moves the consumed changeset under .changeset/pre/ in pre mode.
    await fs.access(path.join(contract.root, '.changeset', 'pre', 'initial-release.md'));
  });

  it('reads a lowercase agents.md (only README.md is case-insensitive) and propagates a patch (§9.2)', async () => {
    const contract = await workspace('1.0.0');
    await contract.writeChangeset('agents.md', "---\n'@pagopa/go-common': patch\n---\n\nFix.\n");
    await contract.changeset('version');
    assert.deepStrictEqual(await contract.versions(), {
      'go-common': '1.0.1',
      'go-aws': '1.0.1',
      'go-runbook': '1.0.1',
    });
  });

  it('ignores hidden and reserved changeset names, like the guard does', async () => {
    const contract = await workspace('1.0.0');
    for (const name of ['.hidden.md', 'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'readme.md']) {
      await contract.writeChangeset(name, "---\n'@pagopa/go-common': patch\n---\n\nX.\n");
    }
    const result = await contract.run('version');
    assert.notStrictEqual(result.status, 0, 'no changeset must be found');
    assert.match(result.output, /No unreleased changesets/u);
    assert.strictEqual((await contract.versions())['go-common'], '1.0.0');
  });
});
