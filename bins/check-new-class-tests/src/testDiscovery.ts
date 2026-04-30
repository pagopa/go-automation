import * as fs from 'node:fs';
import * as path from 'node:path';

interface TestDiscoveryResult {
  readonly found: boolean;
  readonly expectedPaths: ReadonlyArray<string>;
}

const testFileIndexByPackageRoot = new Map<string, ReadonlyArray<string>>();

export function findTestForClass(sourcePath: string, className: string): TestDiscoveryResult {
  const sourceDir = path.dirname(sourcePath);
  const baseName = path.basename(sourcePath, '.ts');
  const expectedPaths = [
    ...new Set([
      path.join(sourceDir, '__tests__', `${className}.test.ts`),
      path.join(sourceDir, '__tests__', `${baseName}.test.ts`),
    ]),
  ];

  if (expectedPaths.some((candidate) => fs.existsSync(candidate))) {
    return { found: true, expectedPaths };
  }

  const packageSourceRoot = packageSrcRoot(sourcePath);
  if (
    packageSourceRoot !== undefined &&
    packageTestContents(packageSourceRoot).some((content) => content.includes(className))
  ) {
    return { found: true, expectedPaths };
  }

  return { found: false, expectedPaths };
}

function packageSrcRoot(sourcePath: string): string | undefined {
  const match = /^(packages\/[^/]+\/src)\//u.exec(sourcePath);
  return match?.[1];
}

function packageTestContents(packageSourceRoot: string): ReadonlyArray<string> {
  const cached = testFileIndexByPackageRoot.get(packageSourceRoot);
  if (cached !== undefined) return cached;

  const contents = readTestContents(packageSourceRoot);
  testFileIndexByPackageRoot.set(packageSourceRoot, contents);

  return contents;
}

function readTestContents(dir: string): ReadonlyArray<string> {
  if (!fs.existsSync(dir)) return [];

  const contents: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      contents.push(...readTestContents(entryPath));
      continue;
    }

    if (!entry.name.endsWith('.test.ts')) continue;
    contents.push(fs.readFileSync(entryPath, 'utf8'));
  }

  return contents;
}
