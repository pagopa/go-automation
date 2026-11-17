import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { versionNeeded } from '../versionNeeded.js';
import { FakeGit } from './fakes.js';

function at(files: Readonly<Record<string, string>>): FakeGit {
  return new FakeGit().commit(
    'c',
    new Map(Object.entries({ '.changeset/config.json': '{}', '.changeset/README.md': 'r', ...files })),
  );
}

describe('version-needed', () => {
  it('is false with no changeset, and ignores README, hidden and reserved files', () => {
    assert.strictEqual(versionNeeded(at({}), 'c'), false);
    assert.strictEqual(versionNeeded(at({ '.changeset/.hidden.md': 'x', '.changeset/CLAUDE.md': 'x' }), 'c'), false);
  });

  it('is true with a pending changeset', () => {
    assert.strictEqual(versionNeeded(at({ '.changeset/brave-fox.md': 'x' }), 'c'), true);
  });

  it('in pre mode counts only the changesets not yet consumed', () => {
    const pre = { '.changeset/pre.json': '{"mode":"pre","tag":"next"}', '.changeset/pre/old.md': 'x' };
    assert.strictEqual(versionNeeded(at(pre), 'c'), false);
    assert.strictEqual(versionNeeded(at({ ...pre, '.changeset/new.md': 'x' }), 'c'), true);
  });

  it('when leaving the prerelease counts the consumed changesets too', () => {
    const exit = { '.changeset/pre.json': '{"mode":"exit","tag":"next"}', '.changeset/pre/old.md': 'x' };
    assert.strictEqual(versionNeeded(at(exit), 'c'), true);
  });

  it('is always true when leaving the prerelease, even with nothing to apply', () => {
    assert.strictEqual(versionNeeded(at({ '.changeset/pre.json': '{"mode":"exit","tag":"next"}' }), 'c'), true);
  });
});
