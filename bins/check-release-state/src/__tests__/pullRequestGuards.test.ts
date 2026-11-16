import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  changesetPackages,
  checkChangesetCoverage,
  checkContribution,
  checkPromotion,
  checkReleasePerimeter,
  pendingChangesets,
} from '../pullRequestGuards.js';
import { FakeGit, packageFiles } from './fakes.js';

const BASE = 'base';
const HEAD = 'head';

function repository(
  baseVersion: string,
  headVersion: string,
  headExtra: Readonly<Record<string, string>> = {},
): FakeGit {
  const git = new FakeGit();
  git.commit(
    BASE,
    packageFiles(
      { 'go-common': ['@pagopa/go-common', baseVersion] },
      { '.changeset/brave-fox.md': 'x', '.changeset/README.md': 'r' },
    ),
  );
  git.commit(HEAD, packageFiles({ 'go-common': ['@pagopa/go-common', headVersion] }, headExtra));
  return git;
}

describe('release-pr-guard perimeter (EVO-PKGPUB-OPUS-01 §10.3, Changesets 3)', () => {
  it('accepts versions, changelogs, consumed changesets and pre.json', () => {
    const git = repository('0.0.0', '1.0.0-next.0');
    git.diffs.set(`${BASE}...${HEAD}`, [
      { status: 'M', path: 'packages/go-common/package.json' },
      { status: 'A', path: 'packages/go-common/CHANGELOG.md' },
      { status: 'R', previousPath: '.changeset/brave-fox.md', path: '.changeset/pre/brave-fox.md' },
      { status: 'D', path: '.changeset/calm-owl.md' },
      { status: 'A', path: '.changeset/pre/calm-owl.md' },
      { status: 'A', path: '.changeset/pre.json' },
      { status: 'D', path: '.changeset/pre/old-cat.md' },
    ]);
    assert.deepStrictEqual(checkReleasePerimeter(git, BASE, HEAD), []);
  });

  it('rejects code, other manifest fields, private packages and changesets added from nowhere', () => {
    const git = repository('0.0.0', '1.0.0-next.0');
    const head = git.commits.get(HEAD);
    const files = new Map(head?.files);
    files.set(
      'packages/go-common/package.json',
      JSON.stringify({ name: '@pagopa/go-common', version: '1.0.0', type: 'commonjs' }),
    );
    git.commit(HEAD, files);
    git.diffs.set(`${BASE}...${HEAD}`, [
      { status: 'M', path: 'packages/go-common/package.json' },
      { status: 'M', path: 'packages/go-common/src/index.ts' },
      { status: 'M', path: 'packages/go-script/package.json' },
      { status: 'A', path: '.changeset/pre/invented.md' },
      { status: 'A', path: '.changeset/new-change.md' },
    ]);
    const violations = checkReleasePerimeter(git, BASE, HEAD);
    assert.strictEqual(violations.length, 5);
    assert.match(violations[0] ?? '', /M packages\/go-common\/package\.json is outside/u);
  });
});

describe('changeset-required: release metadata in a contribution PR', () => {
  it('passes a normal change with its changeset', () => {
    const git = repository('1.0.0', '1.0.0');
    git.diffs.set(`${BASE}...${HEAD}`, [
      { status: 'M', path: 'packages/go-common/src/index.ts' },
      { status: 'A', path: '.changeset/new-change.md' },
    ]);
    assert.deepStrictEqual(checkContribution(git, BASE, HEAD), []);
  });

  it('rejects a hand-made version, a CHANGELOG edit and pre-mode files', () => {
    const git = repository('1.0.0', '1.0.1');
    git.diffs.set(`${BASE}...${HEAD}`, [
      { status: 'M', path: 'packages/go-common/package.json' },
      { status: 'M', path: 'packages/go-common/CHANGELOG.md' },
      { status: 'A', path: '.changeset/pre.json' },
      { status: 'R', previousPath: '.changeset/a.md', path: '.changeset/pre/a.md' },
    ]);
    const violations = checkContribution(git, BASE, HEAD);
    assert.strictEqual(violations.length, 4);
    assert.match(violations[0] ?? '', /version changed by hand \(1\.0\.0 → 1\.0\.1\)/u);
  });
});

describe('promotion-guard (§10.3)', () => {
  it('accepts versions already on main or tagged in the promoted history', () => {
    const git = repository('1.0.0', '1.0.0');
    assert.deepStrictEqual(checkPromotion(git, BASE, HEAD), []);
    const released = repository('1.0.0', '1.1.0');
    released.tags.set('@pagopa/go-common@1.1.0', 'release-commit');
    released.ancestry.add(`release-commit>${HEAD}`);
    assert.deepStrictEqual(checkPromotion(released, BASE, HEAD), []);
  });

  it('rejects a version without tag or tagged outside the promoted history', () => {
    assert.match(checkPromotion(repository('1.0.0', '1.1.0'), BASE, HEAD)[0] ?? '', /has no tag/u);
    const elsewhere = repository('1.0.0', '1.1.0');
    elsewhere.tags.set('@pagopa/go-common@1.1.0', 'other');
    assert.match(checkPromotion(elsewhere, BASE, HEAD)[0] ?? '', /not in this promotion/u);
  });

  it('lists the changesets not yet released', () => {
    assert.deepStrictEqual(pendingChangesets(repository('1.0.0', '1.0.0'), BASE), ['brave-fox.md']);
  });
});

describe('changeset-required: coverage of the changed packages (§10.3)', () => {
  /** base: go-common and go-runbook; head adds the given files. */
  function contribution(changesets: Readonly<Record<string, string>>): FakeGit {
    const git = new FakeGit();
    const packages = {
      'go-common': ['@pagopa/go-common', '1.0.0'],
      'go-runbook': ['@pagopa/go-runbook', '1.0.0'],
    } as const;
    git.commit(BASE, packageFiles(packages));
    git.commit(HEAD, packageFiles(packages, changesets));
    git.diffs.set(`${BASE}...${HEAD}`, [
      { status: 'M', path: 'packages/go-common/src/index.ts' },
      { status: 'M', path: 'packages/go-runbook/src/index.ts' },
      { status: 'M', path: 'scripts/go/x/src/index.ts' },
      ...Object.keys(changesets).map((file) => ({ status: 'A' as const, path: file })),
    ]);
    return git;
  }

  it('requires every changed published package to be named', () => {
    const git = contribution({ '.changeset/a.md': "---\n'@pagopa/go-common': patch\n---\n\nFix.\n" });
    assert.deepStrictEqual(checkChangesetCoverage(git, BASE, HEAD), [
      '@pagopa/go-runbook changed but no changeset of this PR names it: run pnpm changeset (or pnpm changeset --empty)',
    ]);
    const both = contribution({
      '.changeset/a.md': '---\n\'@pagopa/go-common\': patch\n"@pagopa/go-runbook": minor\n---\n\nFix.\n',
    });
    assert.deepStrictEqual(checkChangesetCoverage(both, BASE, HEAD), []);
  });

  it('accepts an explicit empty changeset, and rejects malformed or foreign ones', () => {
    assert.deepStrictEqual(checkChangesetCoverage(contribution({ '.changeset/e.md': '---\n---\n' }), BASE, HEAD), []);
    const wrong = contribution({
      '.changeset/b.md': 'no front matter',
      '.changeset/c.md': "---\n'@go-automation/go-script': patch\n---\n",
      '.changeset/d.md': '---\n---\n',
    });
    const violations = checkChangesetCoverage(wrong, BASE, HEAD);
    assert.strictEqual(violations.length, 2);
    assert.match(violations[0] ?? '', /b\.md is not a valid changeset: could not parse changeset/u);
    assert.match(violations[1] ?? '', /names @go-automation\/go-script, which is not a published package/u);
  });

  it('parses with the Changesets parser, rejecting duplicate keys and bad bump types', () => {
    assert.deepStrictEqual(changesetPackages('---\n\'@pagopa/a\': major\n"@pagopa/b": patch\n---\nx'), [
      '@pagopa/a',
      '@pagopa/b',
    ]);
    assert.deepStrictEqual(changesetPackages('---\n---\n'), []);
    assert.ok(changesetPackages("---\n'@pagopa/a': huge\n---\n") instanceof Error);
    assert.ok(changesetPackages("---\n'@pagopa/a': patch\n'@pagopa/a': major\n---\n") instanceof Error);
    assert.ok(changesetPackages('text') instanceof Error);
  });

  it('rejects changesets whose name Changesets ignores', () => {
    const git = contribution({
      '.changeset/.fix.md': "---\n'@pagopa/go-common': patch\n'@pagopa/go-runbook': patch\n---\n",
      '.changeset/CLAUDE.md': '---\n---\n',
      '.changeset/agents.md': "---\n'@pagopa/go-runbook': patch\n---\n",
    });
    const violations = checkChangesetCoverage(git, BASE, HEAD);
    assert.ok(violations.some((line) => /\.changeset\/\.fix\.md is ignored by Changesets/u.test(line)));
    assert.ok(violations.some((line) => /\.changeset\/CLAUDE\.md is ignored by Changesets/u.test(line)));
    assert.ok(violations.some((line) => /@pagopa\/go-common changed but no changeset/u.test(line)));
    // Only README.md is case-insensitive: a lowercase agents.md is a real changeset.
    assert.ok(!violations.some((line) => /agents\.md/u.test(line)));
    assert.ok(!violations.some((line) => /go-runbook changed/u.test(line)));
  });
});

describe('changeset-required: versions compared with the merge base', () => {
  it('does not blame the PR for a release merged into the base after it started', () => {
    const git = new FakeGit();
    git.commit('start', packageFiles({ 'go-common': ['@pagopa/go-common', '1.0.0'] }));
    git.commit(BASE, packageFiles({ 'go-common': ['@pagopa/go-common', '1.0.1'] }));
    git.commit(HEAD, packageFiles({ 'go-common': ['@pagopa/go-common', '1.0.0'] }));
    git.mergeBases.set(`${BASE}...${HEAD}`, 'start');
    assert.deepStrictEqual(checkContribution(git, BASE, HEAD), []);
  });
});

describe('changeset-required: catalog bumps', () => {
  it('counts a catalog bump as a change of the packages that use it', () => {
    const manifest = (version: string): string =>
      JSON.stringify({ name: '@pagopa/go-common', version, dependencies: { undici: 'catalog:' } });
    const git = new FakeGit();
    git.commit(
      BASE,
      new Map([
        ['packages/go-common/package.json', manifest('1.0.0')],
        ['pnpm-workspace.yaml', "catalog:\n  undici: '8.12.4'\n"],
      ]),
    );
    git.commit(
      HEAD,
      new Map([
        ['packages/go-common/package.json', manifest('1.0.0')],
        ['pnpm-workspace.yaml', "catalog:\n  undici: '8.13.0'\n"],
      ]),
    );
    git.diffs.set(`${BASE}...${HEAD}`, [{ status: 'M', path: 'pnpm-workspace.yaml' }]);
    assert.deepStrictEqual(checkChangesetCoverage(git, BASE, HEAD), [
      '@pagopa/go-common changed but no changeset of this PR names it: run pnpm changeset (or pnpm changeset --empty)',
    ]);
  });
});
