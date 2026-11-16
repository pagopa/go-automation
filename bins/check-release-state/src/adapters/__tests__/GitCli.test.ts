import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GitCli, parseNameStatus } from '../GitCli.js';
import type { CommandResult } from '../../types/CommandResult.js';
import type { RunCommandFn } from '../../types/RunCommandFn.js';

/** A runner and the calls it received. */
interface ScriptedRunner {
  readonly calls: string[];
  readonly run: RunCommandFn;
}

/** A runner that answers from a table keyed by the joined arguments, and records the calls. */
function scriptedRunner(answers: Readonly<Record<string, CommandResult>>): ScriptedRunner {
  const calls: string[] = [];
  return {
    calls,
    run: (command, args) => {
      const key = `${command} ${args.join(' ')}`;
      calls.push(key);
      return answers[key] ?? { status: 128, stdout: '', stderr: `unexpected ${key}` };
    },
  };
}

const ok = (stdout: string): CommandResult => ({ status: 0, stdout, stderr: '' });

describe('GitCli', () => {
  it('reads commits, files and directories', () => {
    const { run } = scriptedRunner({
      'git rev-parse HEAD': ok('abc\n'),
      'git rev-parse abc^1': ok('def\n'),
      'git rev-list --parents -n 1 abc': ok('abc def fed\n'),
      'git show abc:packages/x/package.json': ok('{}'),
      'git ls-tree --name-only abc:packages': ok('go-aws\ngo-common\n'),
    });
    const git = new GitCli(run, '/repo');
    assert.strictEqual(git.head(), 'abc');
    assert.strictEqual(git.firstParent('abc'), 'def');
    assert.deepStrictEqual(git.parents('abc'), ['def', 'fed']);
    assert.strictEqual(git.showFile('abc', 'packages/x/package.json'), '{}');
    assert.strictEqual(git.showFile('abc', 'missing'), undefined);
    assert.deepStrictEqual(git.listDirectory('abc', 'packages'), ['go-aws', 'go-common']);
    assert.deepStrictEqual(git.listDirectory('abc', 'nothing'), []);
  });

  it('reads tags and ancestry, and fails loudly on unexpected git errors', () => {
    const { run, calls } = scriptedRunner({
      'git rev-parse -q --verify refs/tags/@pagopa/go-aws@1.0.0^{commit}': ok('abc\n'),
      'git merge-base --is-ancestor a b': ok(''),
      'git merge-base --is-ancestor b a': { status: 1, stdout: '', stderr: '' },
      'git tag -a t abc -m t': ok(''),
    });
    const git = new GitCli(run, '/repo');
    assert.strictEqual(git.tagCommit('@pagopa/go-aws@1.0.0'), 'abc');
    assert.strictEqual(git.tagCommit('@pagopa/go-aws@2.0.0'), undefined);
    assert.strictEqual(git.isAncestor('a', 'b'), true);
    assert.strictEqual(git.isAncestor('b', 'a'), false);
    assert.throws(() => git.isAncestor('x', 'y'), /merge-base --is-ancestor failed/u);
    git.createAnnotatedTag('t', 'abc', 't');
    assert.ok(calls.includes('git tag -a t abc -m t'));
    assert.throws(() => git.firstParent('zzz'), /git rev-parse zzz\^1 failed/u);
  });

  it('parses name-status output with renames and copies', () => {
    const output = [
      'M',
      'a.ts',
      'R100',
      '.changeset/x.md',
      '.changeset/pre/x.md',
      'D',
      'b.md',
      'C90',
      'c.ts',
      'd.ts',
      'T',
      'e',
      '',
    ].join('\0');
    assert.deepStrictEqual(parseNameStatus(output), [
      { status: 'M', path: 'a.ts' },
      { status: 'R', path: '.changeset/pre/x.md', previousPath: '.changeset/x.md' },
      { status: 'D', path: 'b.md' },
      { status: 'A', path: 'd.ts' },
      { status: 'M', path: 'e' },
    ]);
  });
});
