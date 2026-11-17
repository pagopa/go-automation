import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { auditReleases } from '../auditReleases.js';
import { channelsToMove, channelTargets } from '../channelTargets.js';
import { isPublishedManifest, releaseVersions, tagName } from '../publishedPackages.js';
import { FakeGit, FakeGitHub, FakeRegistry, packageFiles, releasePull } from './fakes.js';

const BEFORE = 'a'.repeat(40);
const RELEASE = 'b'.repeat(40);
const OTHER = 'c'.repeat(40);

/** develop before the release (0.0.0) and the merge commit of the bootstrap release (1.0.0-next.0). */
function bootstrapRepository(): FakeGit {
  const git = new FakeGit();
  git.commit(
    BEFORE,
    packageFiles(
      { 'go-common': ['@pagopa/go-common', '0.0.0'], 'go-aws': ['@pagopa/go-aws', '0.0.0'] },
      {
        'packages/go-script/package.json': JSON.stringify({
          name: '@go-automation/go-script',
          version: '1.0.0',
          private: true,
        }),
      },
    ),
  );
  git.commit(
    RELEASE,
    packageFiles({ 'go-common': ['@pagopa/go-common', '1.0.0-next.0'], 'go-aws': ['@pagopa/go-aws', '1.0.0-next.0'] }),
    BEFORE,
  );
  // A real merge commit: second parent = the head of the release PR.
  git.secondParents.set(RELEASE, 'release-branch-head');
  git.headCommit = RELEASE;
  return git;
}

describe('release versions', () => {
  it('are the published packages whose version changes in the release commit', () => {
    assert.deepStrictEqual(releaseVersions(bootstrapRepository(), RELEASE), [
      { name: '@pagopa/go-aws', version: '1.0.0-next.0' },
      { name: '@pagopa/go-common', version: '1.0.0-next.0' },
    ]);
  });

  it('only count @pagopa packages that are not private', () => {
    assert.strictEqual(isPublishedManifest({ name: '@pagopa/go-common' }), true);
    assert.strictEqual(isPublishedManifest({ name: '@pagopa/x', private: true }), false);
    assert.strictEqual(isPublishedManifest({ name: '@go-automation/go-script' }), false);
    assert.strictEqual(tagName({ name: '@pagopa/go-aws', version: '1.0.0' }), '@pagopa/go-aws@1.0.0');
  });
});

describe('channel targets (§9.3 promote-channels)', () => {
  it('put latest on the highest stable and next on the highest -next above it', () => {
    assert.deepStrictEqual(channelTargets(['1.0.0-next.0', '1.0.0-next.2', '1.0.0-next.10']), {
      next: '1.0.0-next.10',
    });
    assert.deepStrictEqual(channelTargets(['1.0.0-next.3', '1.0.0', '1.0.1', '0.9.0']), { latest: '1.0.1' });
    assert.deepStrictEqual(channelTargets(['1.0.0', '2.0.0-next.1', 'not-semver', '1.5.0-beta.1']), {
      latest: '1.0.0',
      next: '2.0.0-next.1',
    });
  });

  it('move only the channels that differ, leaving channels without a target alone', () => {
    assert.deepStrictEqual(channelsToMove({ latest: '1.0.1' }, { latest: '1.0.0', next: '1.0.0-next.3' }), [
      ['latest', '1.0.1'],
    ]);
    assert.deepStrictEqual(
      channelsToMove({ next: '1.0.0-next.1' }, { latest: '1.0.0-next.0', next: '1.0.0-next.1' }),
      [],
    );
  });
});

describe('audit (§9.3)', () => {
  it('is green with no release yet and when every release is published, tagged and aligned', async () => {
    const git = bootstrapRepository();
    const github = new FakeGitHub();
    const registry = new FakeRegistry();
    assert.deepStrictEqual(await auditReleases({ git, registry, github }), []);

    github.pulls.push(releasePull(7, RELEASE));
    for (const name of ['@pagopa/go-common', '@pagopa/go-aws']) {
      registry.published.set(name, ['1.0.0-next.0']);
      registry.tags.set(name, { latest: '1.0.0-next.0', next: '1.0.0-next.0' });
      git.tags.set(`${name}@1.0.0-next.0`, RELEASE);
    }
    assert.deepStrictEqual(await auditReleases({ git, registry, github }), []);
  });

  it('reports a version not published, a missing tag and a misplaced channel, with the recovery', async () => {
    const git = bootstrapRepository();
    const github = new FakeGitHub();
    github.pulls.push(releasePull(7, RELEASE));
    github.pulls.push({ ...releasePull(8, OTHER), sameRepository: false });
    const registry = new FakeRegistry();
    registry.published.set('@pagopa/go-common', ['1.0.0-next.0', '1.0.0-next.1']);
    registry.tags.set('@pagopa/go-common', { next: '1.0.0-next.0' });
    const problems = await auditReleases({ git, registry, github });
    assert.strictEqual(problems.length, 3);
    assert.match(
      problems[0] ?? '',
      /@pagopa\/go-aws@1\.0\.0-next\.0 is not on the registry; re-run the failed jobs of the Release run of PR #7/u,
    );
    assert.match(problems[1] ?? '', /tag @pagopa\/go-common@1\.0\.0-next\.0 is missing/u);
    assert.match(problems[2] ?? '', /dist-tag next must point to 1\.0\.0-next\.1 \(last release: b{40}\)/u);
  });

  it('reports a version tag that points to another commit', async () => {
    const git = bootstrapRepository();
    const github = new FakeGitHub();
    github.pulls.push(releasePull(7, RELEASE));
    const registry = new FakeRegistry();
    for (const name of ['@pagopa/go-common', '@pagopa/go-aws']) {
      registry.published.set(name, ['1.0.0-next.0']);
      registry.tags.set(name, { next: '1.0.0-next.0' });
      git.tags.set(`${name}@1.0.0-next.0`, name === '@pagopa/go-aws' ? OTHER : RELEASE);
    }
    const problems = await auditReleases({ git, registry, github });
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0] ?? '', /tag @pagopa\/go-aws@1\.0\.0-next\.0 points to c{40}, not to the release b{40}/u);
  });

  it('rejects a release PR merged without a merge commit (rebase or squash)', async () => {
    const git = bootstrapRepository();
    git.secondParents.delete(RELEASE);
    const github = new FakeGitHub();
    github.pulls.push(releasePull(7, RELEASE));
    const problems = await auditReleases({ git, registry: new FakeRegistry(), github });
    assert.match(problems[0] ?? '', /has 1 parent\(s\): release PRs must be merged with "Create a merge commit"/u);
  });

  it('reports a release commit missing from the local history', async () => {
    const github = new FakeGitHub();
    github.pulls.push(releasePull(9, OTHER));
    const problems = await auditReleases({ git: bootstrapRepository(), registry: new FakeRegistry(), github });
    assert.match(problems[0] ?? '', /cannot read c{40}.*fetch the full history/u);
  });
});
