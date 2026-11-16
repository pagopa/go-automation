import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NpmRegistryCli } from '../NpmRegistryCli.js';
import type { CommandResult } from '../../types/CommandResult.js';
import type { RunCommandFn } from '../../types/RunCommandFn.js';

const REGISTRY = '--registry=https://npm.pkg.github.com';

function runner(answers: Readonly<Record<string, CommandResult>>, calls: string[] = []): RunCommandFn {
  return (command, args) => {
    const key = `${command} ${args.join(' ')}`;
    calls.push(key);
    return answers[key] ?? { status: 1, stdout: '', stderr: 'npm error code E404' };
  };
}

describe('NpmRegistryCli', () => {
  it('reads versions and dist-tags from GitHub Packages', () => {
    const registry = new NpmRegistryCli(
      runner({
        [`npm view @pagopa/a versions --json ${REGISTRY}`]: {
          status: 0,
          stdout: '["1.0.0-next.0","1.0.0-next.1"]',
          stderr: '',
        },
        [`npm view @pagopa/b versions --json ${REGISTRY}`]: { status: 0, stdout: '"1.0.0"', stderr: '' },
        [`npm view @pagopa/a dist-tags --json ${REGISTRY}`]: {
          status: 0,
          stdout: '{"next":"1.0.0-next.1","x":3}',
          stderr: '',
        },
      }),
      '/repo',
    );
    assert.deepStrictEqual(registry.versions('@pagopa/a'), ['1.0.0-next.0', '1.0.0-next.1']);
    assert.deepStrictEqual(registry.versions('@pagopa/b'), ['1.0.0']);
    assert.deepStrictEqual(registry.distTags('@pagopa/a'), { next: '1.0.0-next.1' });
  });

  it('treats a package never published as empty, and other errors as failures', () => {
    const registry = new NpmRegistryCli(
      runner({
        [`npm view @pagopa/c versions --json ${REGISTRY}`]: { status: 1, stdout: '', stderr: 'npm error code E401' },
      }),
      '/repo',
    );
    assert.deepStrictEqual(registry.versions('@pagopa/new'), []);
    assert.deepStrictEqual(registry.distTags('@pagopa/new'), {});
    assert.throws(() => registry.versions('@pagopa/c'), /E401/u);
  });

  it('moves a dist-tag', () => {
    const calls: string[] = [];
    const ok = { status: 0, stdout: '', stderr: '' };
    const registry = new NpmRegistryCli(
      runner({ [`npm dist-tag add @pagopa/a@1.0.1 latest ${REGISTRY}`]: ok }, calls),
      '/repo',
    );
    registry.setDistTag('@pagopa/a', '1.0.1', 'latest');
    assert.deepStrictEqual(calls, [`npm dist-tag add @pagopa/a@1.0.1 latest ${REGISTRY}`]);
    assert.throws(() => registry.setDistTag('@pagopa/a', '9.9.9', 'latest'), /dist-tag add/u);
  });
});
