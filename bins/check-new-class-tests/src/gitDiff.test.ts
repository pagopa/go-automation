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
  const path = 'packages/go-common/src/Foo.ts';
  const cases: ReadonlyArray<readonly [string, ReadonlyArray<string>, ReadonlyArray<number>]> = [
    ['extracts added line numbers', ['@@ -0,0 +1,2 @@', '+export class Foo {}', '+export class Bar {}'], [1, 2]],
    ['ignores deleted lines when tracking new line numbers', ['@@ -4,2 +4,2 @@', '-old line', '+new line'], [4]],
    [
      'ignores hunk metadata lines when tracking new line numbers',
      ['@@ -1,2 +1,3 @@', ' unchanged', '+export class Foo {}', '\\ No newline at end of file', '+export class Bar {}'],
      [2, 3],
    ],
  ];

  for (const [name, hunk, expected] of cases) {
    it(name, () => {
      const diff = [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ...hunk, ''].join('\n');

      const [file] = parseGitDiff(diff);

      assert.ok(file);
      assert.strictEqual(file.path, path);
      assert.deepStrictEqual([...file.addedLines], expected);
    });
  }
});
