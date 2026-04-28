import * as fs from 'fs/promises';
import * as path from 'path';

function toRelative(rootDir: string, targetPath: string): string {
  return path.relative(rootDir, targetPath).replace(/\\/g, '/') || '.';
}

function isExcluded(relativePath: string, exclude: ReadonlyArray<string>): boolean {
  return exclude.some((excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}/`));
}

function isMissingDirectoryError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export async function discoverWorkspacePackages(
  rootDir: string,
  include: ReadonlyArray<string>,
  exclude: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> {
  const packages: string[] = [];

  for (const dir of include) {
    const fullDir = path.join(rootDir, dir);

    try {
      const entries = await fs.readdir(fullDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const fullPath = path.join(fullDir, entry.name);
        const relative = toRelative(rootDir, fullPath);

        if (!isExcluded(relative, exclude)) {
          packages.push(fullPath);
        }
      }
    } catch (error: unknown) {
      if (!isMissingDirectoryError(error)) {
        throw error;
      }

      // Directory doesn't exist yet.
    }
  }

  return packages.sort();
}

export function resolveFixedPaths(
  rootDir: string,
  paths: ReadonlyArray<string>,
  exclude: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return paths
    .map((target) => path.join(rootDir, target))
    .filter((target) => !isExcluded(toRelative(rootDir, target), exclude))
    .sort();
}

export function toWorkspaceRelativePath(rootDir: string, targetPath: string): string {
  return toRelative(rootDir, targetPath);
}
