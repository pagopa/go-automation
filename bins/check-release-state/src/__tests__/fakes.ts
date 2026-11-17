import type { DiffEntry } from '../types/DiffEntry.js';
import type { GitHubPort } from '../types/GitHubPort.js';
import type { GitPort } from '../types/GitPort.js';
import type { PullRequestInfo } from '../types/PullRequestInfo.js';
import type { RegistryPort } from '../types/RegistryPort.js';

/** One commit of the fake repository. */
interface FakeCommit {
  readonly parent?: string;
  readonly files: ReadonlyMap<string, string>;
}

/** Files of the published packages at one commit: `{ 'go-common': ['@pagopa/go-common', '1.0.0'] }`. */
export function packageFiles(
  packages: Readonly<Record<string, readonly [string, string]>>,
  extra: Readonly<Record<string, string>> = {},
): ReadonlyMap<string, string> {
  const files = new Map<string, string>(Object.entries(extra));
  for (const [directory, [name, version]] of Object.entries(packages)) {
    files.set(`packages/${directory}/package.json`, JSON.stringify({ name, version, type: 'module' }));
  }
  return files;
}

/** In-memory {@link GitPort}: commits, tags, diffs and ancestry are declared by the test. */
export class FakeGit implements GitPort {
  public headCommit = '';
  public readonly commits = new Map<string, FakeCommit>();
  public readonly tags = new Map<string, string>();
  public readonly diffs = new Map<string, ReadonlyArray<DiffEntry>>();
  public readonly ancestry = new Set<string>();
  public readonly worktrees: string[] = [];

  public commit(id: string, files: ReadonlyMap<string, string>, parent?: string): this {
    this.commits.set(id, { files, ...(parent === undefined ? {} : { parent }) });
    return this;
  }

  public head(): string {
    return this.headCommit;
  }

  public readonly secondParents = new Map<string, string>();

  public parents(commit: string): ReadonlyArray<string> {
    const first = this.commits.get(commit)?.parent;
    const second = this.secondParents.get(commit);
    return [...(first === undefined ? [] : [first]), ...(second === undefined ? [] : [second])];
  }

  public firstParent(commit: string): string {
    const parent = this.commits.get(commit)?.parent;
    if (parent === undefined) throw new Error(`unknown commit ${commit}`);
    return parent;
  }

  public showFile(commit: string, filePath: string): string | undefined {
    return this.commits.get(commit)?.files.get(filePath);
  }

  public readonly mergeBases = new Map<string, string>();

  public mergeBase(left: string, right: string): string {
    return this.mergeBases.get(`${left}...${right}`) ?? left;
  }

  public listFiles(commit: string, directory: string): ReadonlyArray<string> {
    return [...(this.commits.get(commit)?.files.keys() ?? [])].filter((filePath) =>
      filePath.startsWith(`${directory}/`),
    );
  }

  public listDirectory(commit: string, directory: string): ReadonlyArray<string> {
    const names = new Set<string>();
    for (const filePath of this.commits.get(commit)?.files.keys() ?? []) {
      if (!filePath.startsWith(`${directory}/`)) continue;
      const [name] = filePath.slice(directory.length + 1).split('/');
      if (name !== undefined) names.add(name);
    }
    return [...names];
  }

  public diff(base: string, head: string): ReadonlyArray<DiffEntry> {
    return this.diffs.get(`${base}...${head}`) ?? [];
  }

  public tagCommit(tag: string): string | undefined {
    return this.tags.get(tag);
  }

  public isAncestor(ancestor: string, descendant: string): boolean {
    return ancestor === descendant || this.ancestry.has(`${ancestor}>${descendant}`);
  }

  public addWorktree(directory: string): void {
    this.worktrees.push(directory);
  }

  public removeWorktree(directory: string): void {
    this.worktrees.splice(this.worktrees.indexOf(directory), 1);
  }
}

/** In-memory {@link RegistryPort}. */
export class FakeRegistry implements RegistryPort {
  public readonly published = new Map<string, string[]>();
  public readonly tags = new Map<string, Record<string, string>>();

  public versions(name: string): ReadonlyArray<string> {
    return this.published.get(name) ?? [];
  }

  public distTags(name: string): Readonly<Record<string, string>> {
    return this.tags.get(name) ?? {};
  }
}

/** In-memory {@link GitHubPort}. */
export class FakeGitHub implements GitHubPort {
  public readonly pulls: PullRequestInfo[] = [];

  public async closedPulls(baseRef: string): Promise<ReadonlyArray<PullRequestInfo>> {
    await Promise.resolve();
    return this.pulls.filter((pull) => pull.baseRef === baseRef);
  }
}

/** A merged release PR towards `develop`. */
export function releasePull(number: number, mergeCommitSha: string): PullRequestInfo {
  return {
    number,
    merged: true,
    mergeCommitSha,
    headRef: `release/2026-11-${String(number)}`,
    baseRef: 'develop',
    sameRepository: true,
  };
}
