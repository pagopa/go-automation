import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseGitDiff } from './gitDiff.js';

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
});
