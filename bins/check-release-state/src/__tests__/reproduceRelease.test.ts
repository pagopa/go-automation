import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { reproduceRelease } from '../reproduceRelease.js';
import type { RunCommandFn } from '../types/RunCommandFn.js';
import { FakeGit, packageFiles } from './fakes.js';

const BASE_TREE: Readonly<Record<string, string>> = {
  'packages/go-common/package.json': '{"name":"@pagopa/go-common","version":"0.0.0"}',
  '.changeset/initial-release.md': '---\n"@pagopa/go-common": major\n---\n',
};
const RELEASED_TREE: Readonly<Record<string, string>> = {
  'packages/go-common/package.json': '{"name":"@pagopa/go-common","version":"1.0.0-next.0"}',
  '.changeset/pre.json': '{"mode":"pre","tag":"next"}',
  '.changeset/pre/initial-release.md': '---\n"@pagopa/go-common": major\n---\n',
};

function writeTree(root: string, files: Readonly<Record<string, string>>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

/** The base and the head of the release PR; the head is only read through git. */
function repository(head: Readonly<Record<string, string>> = RELEASED_TREE): FakeGit {
  const git = new FakeGit();
  git.commit('base', packageFiles({ 'go-common': ['@pagopa/go-common', '0.0.0'] }));
  git.commit('head', new Map(Object.entries(head)));
  return git;
}

describe('release-pr-guard reproduction (EVO-PKGPUB-OPUS-01 §10.3 point 3)', () => {
  let root = '';
  let work = '';
  let calls: string[] = [];

  /** Fake changeset CLI: `version` turns the base worktree into {@link RELEASED_TREE}. */
  const changesetCli: RunCommandFn = (_command, args, cwd) => {
    calls.push(args.slice(1).join(' '));
    if (args[1] === 'version') {
      writeTree(cwd, RELEASED_TREE);
      rmSync(path.join(cwd, '.changeset', 'initial-release.md'), { force: true });
    }
    return { status: 0, stdout: '', stderr: '' };
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'reproduce-head-'));
    work = await fs.mkdtemp(path.join(os.tmpdir(), 'reproduce-work-'));
    calls = [];
    // Trusted checkout of the base: only its node_modules is used.
    mkdirSync(path.join(root, 'node_modules'));
    // The fake git does not check out: the worktree of the base is written here.
    writeTree(path.join(work, 'base'), BASE_TREE);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(work, { recursive: true, force: true });
  });

  it('enters pre mode like the head, runs changeset version on the base and finds the same files', async () => {
    const git = repository();
    const input = { repositoryRoot: root, base: 'base', head: 'head', workDirectory: work };
    assert.deepStrictEqual(await reproduceRelease(git, changesetCli, input), []);
    assert.deepStrictEqual(calls, ['pre enter next', 'version']);
    assert.deepStrictEqual(git.worktrees, [], 'the worktree is removed');
  });

  it('reports the files the PR changed differently from changeset version', async () => {
    const head = {
      ...RELEASED_TREE,
      'packages/go-common/package.json': '{"name":"@pagopa/go-common","version":"9.9.9"}',
      '.changeset/extra.md': 'x',
    };
    const input = { repositoryRoot: root, base: 'base', head: 'head', workDirectory: work };
    const differences = await reproduceRelease(repository(head), changesetCli, input);
    assert.deepStrictEqual(differences, [
      '.changeset/extra.md is in the PR but changeset version does not produce it',
      'packages/go-common/package.json differs from what changeset version produces on the base',
    ]);
  });

  it('reports a failing changeset command and still removes the worktree', async () => {
    const git = repository();
    const failing: RunCommandFn = () => ({ status: 1, stdout: '', stderr: 'boom' });
    const input = { repositoryRoot: root, base: 'base', head: 'head', workDirectory: work };
    const differences = await reproduceRelease(git, failing, input);
    assert.match(differences[0] ?? '', /changeset pre enter next failed on the base: boom/u);
    assert.deepStrictEqual(git.worktrees, []);
  });

  it('rejects a prerelease channel other than next before running anything', async () => {
    const git = repository({ ...RELEASED_TREE, '.changeset/pre.json': '{"mode":"pre","tag":"alpha"}' });
    const input = { repositoryRoot: root, base: 'base', head: 'head', workDirectory: work };
    const differences = await reproduceRelease(git, changesetCli, input);
    assert.match(differences[0] ?? '', /must be absent or \{"mode":"pre","tag":"next"\}/u);
    assert.deepStrictEqual(calls, []);
  });
});
