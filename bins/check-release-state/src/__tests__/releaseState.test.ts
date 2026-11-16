import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { auditReleases } from '../auditReleases.js';
import { channelsToMove, channelTargets } from '../channelTargets.js';
import { isPublishedManifest, releaseVersions, tagName } from '../publishedPackages.js';
import { promoteChannels, reconcileTags } from '../releaseWrites.js';
import { resolveReleaseSha } from '../resolveReleaseSha.js';
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

describe('release versions (EVO-PKGPUB-OPUS-01 §9.3)', () => {
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

describe('reconcile-tags and promote-channels', () => {
  it('write nothing when HEAD is not the release commit', () => {
    const git = bootstrapRepository();
    git.headCommit = OTHER;
    const context = { git, registry: new FakeRegistry(), github: new FakeGitHub() };
    assert.throws(() => reconcileTags(context, RELEASE), /not the release commit/u);
    assert.throws(() => promoteChannels(context, RELEASE), /not the release commit/u);
    assert.deepStrictEqual(git.created, []);
  });

  it('tag only the versions of the release that are on the registry (partial publish)', () => {
    const git = bootstrapRepository();
    const registry = new FakeRegistry();
    registry.published.set('@pagopa/go-common', ['1.0.0-next.0']);
    const created = reconcileTags({ git, registry, github: new FakeGitHub() }, RELEASE);
    assert.deepStrictEqual(created, ['@pagopa/go-common@1.0.0-next.0']);
    assert.deepStrictEqual(reconcileTags({ git, registry, github: new FakeGitHub() }, RELEASE), []);
  });

  it('refuse a tag that points to another commit', () => {
    const git = bootstrapRepository();
    git.tags.set('@pagopa/go-aws@1.0.0-next.0', OTHER);
    assert.throws(
      () => reconcileTags({ git, registry: new FakeRegistry(), github: new FakeGitHub() }, RELEASE),
      /points to/u,
    );
  });

  it('move a channel left behind by the recovery of an older release', () => {
    const git = bootstrapRepository();
    const registry = new FakeRegistry();
    registry.published.set('@pagopa/go-common', ['1.0.0-next.0', '1.0.0-next.1']);
    registry.tags.set('@pagopa/go-common', { next: '1.0.0-next.0', latest: '1.0.0-next.0' });
    const moved = promoteChannels({ git, registry, github: new FakeGitHub() }, RELEASE);
    assert.deepStrictEqual(moved, ['@pagopa/go-common: next → 1.0.0-next.1']);
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
    assert.match(problems[0] ?? '', /@pagopa\/go-aws@1\.0\.0-next\.0 is not on the registry; .*release_sha=b{40}/u);
    assert.match(problems[1] ?? '', /tag @pagopa\/go-common@1\.0\.0-next\.0 is missing/u);
    assert.match(problems[2] ?? '', /dist-tag next must point to 1\.0\.0-next\.1; .*release_sha=b{40}/u);
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
    await assert.rejects(
      resolveReleaseSha(
        'pull_request',
        {
          pull_request: {
            merged: true,
            merge_commit_sha: RELEASE,
            head: { ref: 'release/x', repo: { full_name: 'r' } },
            base: { ref: 'develop' },
          },
        },
        'r',
        github,
        git,
      ),
      /Create a merge commit/u,
    );
  });

  it('reports a release commit missing from the local history', async () => {
    const github = new FakeGitHub();
    github.pulls.push(releasePull(9, OTHER));
    const problems = await auditReleases({ git: bootstrapRepository(), registry: new FakeRegistry(), github });
    assert.match(problems[0] ?? '', /cannot read c{40}.*fetch the full history/u);
  });
});

describe('resolve-sha (§9.3)', () => {
  const pullRequestEvent = (overrides: Readonly<Record<string, unknown>> = {}): unknown => ({
    pull_request: {
      merged: true,
      merge_commit_sha: RELEASE,
      head: { ref: 'release/2026-11-16', repo: { full_name: 'pagopa/go-automation' } },
      base: { ref: 'develop' },
      ...overrides,
    },
  });

  it('returns the merge commit of a merged release PR of this repository', async () => {
    assert.strictEqual(
      await resolveReleaseSha(
        'pull_request',
        pullRequestEvent(),
        'pagopa/go-automation',
        new FakeGitHub(),
        bootstrapRepository(),
      ),
      RELEASE,
    );
  });

  it('refuses a PR not merged, from a fork, or not towards develop', async () => {
    const github = new FakeGitHub();
    await assert.rejects(
      resolveReleaseSha(
        'pull_request',
        pullRequestEvent({ merged: false }),
        'pagopa/go-automation',
        github,
        bootstrapRepository(),
      ),
    );
    const fork = pullRequestEvent({ head: { ref: 'release/x', repo: { full_name: 'someone/go-automation' } } });
    await assert.rejects(
      resolveReleaseSha('pull_request', fork, 'pagopa/go-automation', github, bootstrapRepository()),
      /not a release PR/u,
    );
    await assert.rejects(
      resolveReleaseSha(
        'pull_request',
        pullRequestEvent({ base: { ref: 'main' } }),
        'pagopa/go-automation',
        github,
        bootstrapRepository(),
      ),
    );
  });

  it('accepts a recovery SHA only when GitHub confirms it is the merge commit of a release PR', async () => {
    const github = new FakeGitHub();
    github.pulls.push(releasePull(7, RELEASE));
    github.pulls.push({ ...releasePull(8, OTHER), headRef: 'feature/x' });
    assert.strictEqual(
      await resolveReleaseSha(
        'workflow_dispatch',
        { inputs: { release_sha: RELEASE } },
        'r',
        github,
        bootstrapRepository(),
      ),
      RELEASE,
    );
    await assert.rejects(
      resolveReleaseSha('workflow_dispatch', { inputs: { release_sha: OTHER } }, 'r', github, bootstrapRepository()),
      /not the merge commit/u,
    );
    await assert.rejects(
      resolveReleaseSha('workflow_dispatch', { inputs: { release_sha: 'abc' } }, 'r', github, bootstrapRepository()),
      /full commit SHA/u,
    );
    await assert.rejects(resolveReleaseSha('push', {}, 'r', github, bootstrapRepository()), /cannot start a release/u);
  });
});
