import type { RunCommandFn } from '../types/RunCommandFn.js';
import type { DiffEntry } from '../types/DiffEntry.js';
import type { GitPort } from '../types/GitPort.js';

/** {@link GitPort} on the `git` command line, in one repository. */
export class GitCli implements GitPort {
  /**
   * @param run - Command runner
   * @param cwd - Repository folder
   */
  constructor(
    private readonly run: RunCommandFn,
    private readonly cwd: string,
  ) {}

  public head(): string {
    return this.git(['rev-parse', 'HEAD']).trim();
  }

  public parents(commit: string): ReadonlyArray<string> {
    return this.git(['rev-list', '--parents', '-n', '1', commit]).trim().split(' ').slice(1);
  }

  public firstParent(commit: string): string {
    return this.git(['rev-parse', `${commit}^1`]).trim();
  }

  public showFile(commit: string, filePath: string): string | undefined {
    const result = this.run('git', ['show', `${commit}:${filePath}`], this.cwd);
    return result.status === 0 ? result.stdout : undefined;
  }

  public mergeBase(left: string, right: string): string {
    return this.git(['merge-base', left, right]).trim();
  }

  public listFiles(commit: string, directory: string): ReadonlyArray<string> {
    const result = this.run('git', ['ls-tree', '-r', '--name-only', commit, '--', directory], this.cwd);
    if (result.status !== 0) return [];
    return result.stdout.split('\n').filter((line) => line !== '');
  }

  public listDirectory(commit: string, directory: string): ReadonlyArray<string> {
    const result = this.run('git', ['ls-tree', '--name-only', `${commit}:${directory}`], this.cwd);
    if (result.status !== 0) return [];
    return result.stdout.split('\n').filter((line) => line !== '');
  }

  public diff(base: string, head: string): ReadonlyArray<DiffEntry> {
    const output = this.git(['diff', '--name-status', '-M', '-z', `${base}...${head}`]);
    return parseNameStatus(output);
  }

  public tagCommit(tag: string): string | undefined {
    const result = this.run('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`], this.cwd);
    return result.status === 0 ? result.stdout.trim() : undefined;
  }

  public createAnnotatedTag(tag: string, commit: string, message: string): void {
    this.git(['tag', '-a', tag, commit, '-m', message]);
  }

  public isAncestor(ancestor: string, descendant: string): boolean {
    const result = this.run('git', ['merge-base', '--is-ancestor', ancestor, descendant], this.cwd);
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new Error(`git merge-base --is-ancestor failed: ${result.stderr.trim()}`);
  }

  public addWorktree(directory: string, commit: string): void {
    this.git(['worktree', 'add', '--detach', directory, commit]);
  }

  public removeWorktree(directory: string): void {
    this.git(['worktree', 'remove', '--force', directory]);
  }

  private git(args: ReadonlyArray<string>): string {
    const result = this.run('git', args, this.cwd);
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
    return result.stdout;
  }
}

/**
 * Parses `git diff --name-status -M -z`: NUL-separated fields, a rename has a status like `R100`
 * followed by the old and the new path. Copies and type changes count as modifications.
 *
 * @param output - Raw output
 * @returns The changed files
 */
export function parseNameStatus(output: string): ReadonlyArray<DiffEntry> {
  const fields = output.split('\0').filter((field) => field !== '');
  const entries: DiffEntry[] = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index] ?? '';
    if (status.startsWith('R') || status.startsWith('C')) {
      const previousPath = fields[index + 1] ?? '';
      const newPath = fields[index + 2] ?? '';
      entries.push(
        status.startsWith('R') ? { status: 'R', path: newPath, previousPath } : { status: 'A', path: newPath },
      );
      index += 3;
      continue;
    }
    const filePath = fields[index + 1] ?? '';
    const kind = status.charAt(0);
    entries.push({ status: kind === 'A' || kind === 'D' ? kind : 'M', path: filePath });
    index += 2;
  }
  return entries;
}
