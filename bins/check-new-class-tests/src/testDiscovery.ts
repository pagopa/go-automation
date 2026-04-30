import * as fs from 'node:fs';
import * as path from 'node:path';

interface TestDiscoveryResult {
  readonly found: boolean;
  readonly expectedPaths: ReadonlyArray<string>;
}

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
  if (packageSourceRoot !== undefined && classNameExistsInAnyTest(packageSourceRoot, className)) {
    return { found: true, expectedPaths };
  }

  return { found: false, expectedPaths };
}

function packageSrcRoot(sourcePath: string): string | undefined {
  const match = /^(packages\/[^/]+\/src)\//u.exec(sourcePath);
  return match?.[1];
}

function classNameExistsInAnyTest(dir: string, className: string): boolean {
  if (!fs.existsSync(dir)) return false;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (classNameExistsInAnyTest(entryPath, className)) return true;
      continue;
    }

    if (!entry.name.endsWith('.test.ts')) continue;
    if (fs.readFileSync(entryPath, 'utf8').includes(className)) return true;
  }

  return false;
}
