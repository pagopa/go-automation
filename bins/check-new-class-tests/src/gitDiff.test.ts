import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseGitDiff, readChangedFiles } from './gitDiff.js';

describe('readChangedFiles', () => {
  it('rejects ambiguous base refs before invoking git diff', () => {
    assert.throws(() => readChangedFiles('-w'), /must not start with/u);
    assert.throws(() => readChangedFiles('origin/main -- packages'), /must not contain whitespace/u);
    assert.throws(() => readChangedFiles('   '), /must be non-empty/u);
  });
});

describe('parseGitDiff', () => {
  it('extracts added line numbers for package source files', () => {
    const diff = [
      'diff --git a/packages/go-common/src/Foo.ts b/packages/go-common/src/Foo.ts',
      '--- a/packages/go-common/src/Foo.ts',
      '+++ b/packages/go-common/src/Foo.ts',
      '@@ -0,0 +1,2 @@',
      '+export class Foo {}',
      '+export class Bar {}',
      '',
    ].join('\n');

    const [file] = parseGitDiff(diff);

    assert.ok(file);
    assert.strictEqual(file.path, 'packages/go-common/src/Foo.ts');
    assert.deepStrictEqual([...file.addedLines], [1, 2]);
  });

  it('ignores deleted lines when tracking new line numbers', () => {
    const diff = [
      'diff --git a/packages/go-common/src/Foo.ts b/packages/go-common/src/Foo.ts',
      '--- a/packages/go-common/src/Foo.ts',
      '+++ b/packages/go-common/src/Foo.ts',
      '@@ -4,2 +4,2 @@',
      '-old line',
      '+new line',
      '',
    ].join('\n');

    const [file] = parseGitDiff(diff);

    assert.ok(file);
    assert.deepStrictEqual([...file.addedLines], [4]);
  });

  it('ignores git hunk metadata lines when tracking new line numbers', () => {
    const diff = [
      'diff --git a/packages/go-common/src/Foo.ts b/packages/go-common/src/Foo.ts',
      '--- a/packages/go-common/src/Foo.ts',
      '+++ b/packages/go-common/src/Foo.ts',
      '@@ -1,2 +1,3 @@',
      ' unchanged',
      '+export class Foo {}',
      '\\ No newline at end of file',
      '+export class Bar {}',
      '',
    ].join('\n');

    const [file] = parseGitDiff(diff);

    assert.ok(file);
    assert.deepStrictEqual([...file.addedLines], [2, 3]);
  });
});
