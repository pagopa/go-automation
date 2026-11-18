import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { versionNeeded } from '../versionNeeded.js';
import { FakeGit } from './fakes.js';

const PRE = '{"mode":"pre","tag":"next"}';
const EXIT = '{"mode":"exit","tag":"next"}';

describe('version-needed', () => {
  const cases: ReadonlyArray<readonly [string, Readonly<Record<string, string>>, boolean]> = [
    ['is false with no changeset', {}, false],
    ['ignores hidden and reserved files', { '.changeset/.hidden.md': 'x', '.changeset/CLAUDE.md': 'x' }, false],
    ['is true with a pending changeset', { '.changeset/brave-fox.md': 'x' }, true],
    [
      'in pre mode ignores the consumed changesets',
      { '.changeset/pre.json': PRE, '.changeset/pre/old.md': 'x' },
      false,
    ],
    [
      'in pre mode counts the changesets not yet consumed',
      { '.changeset/pre.json': PRE, '.changeset/pre/old.md': 'x', '.changeset/new.md': 'x' },
      true,
    ],
    [
      'when leaving the prerelease counts the consumed changesets too',
      { '.changeset/pre.json': EXIT, '.changeset/pre/old.md': 'x' },
      true,
    ],
    ['is always true when leaving the prerelease, even with nothing to apply', { '.changeset/pre.json': EXIT }, true],
  ];

  for (const [name, files, expected] of cases) {
    it(name, () => {
      const git = new FakeGit().commit(
        'c',
        new Map(Object.entries({ '.changeset/config.json': '{}', '.changeset/README.md': 'r', ...files })),
      );
      assert.strictEqual(versionNeeded(git, 'c'), expected);
    });
  }
});
