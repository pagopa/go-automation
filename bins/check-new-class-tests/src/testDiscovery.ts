import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

interface TestDiscoveryResult {
  readonly found: boolean;
  readonly expectedPaths: ReadonlyArray<string>;
}

const testIdentifierIndexByPackageRoot = new Map<string, ReadonlySet<string>>();

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
  if (packageSourceRoot !== undefined && packageTestIdentifiers(packageSourceRoot).has(className)) {
    return { found: true, expectedPaths };
  }

  return { found: false, expectedPaths };
}

function packageSrcRoot(sourcePath: string): string | undefined {
  const match = /^(packages\/[^/]+\/src)\//u.exec(sourcePath);
  return match?.[1];
}

function packageTestIdentifiers(packageSourceRoot: string): ReadonlySet<string> {
  const cached = testIdentifierIndexByPackageRoot.get(packageSourceRoot);
  if (cached !== undefined) return cached;

  const identifiers = readTestIdentifiers(packageSourceRoot);
  testIdentifierIndexByPackageRoot.set(packageSourceRoot, identifiers);

  return identifiers;
}

function readTestIdentifiers(dir: string): ReadonlySet<string> {
  const identifiers = new Set<string>();
  collectTestIdentifiers(dir, identifiers);

  return identifiers;
}

function collectTestIdentifiers(dir: string, identifiers: Set<string>): void {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTestIdentifiers(entryPath, identifiers);
      continue;
    }

    if (!entry.name.endsWith('.test.ts')) continue;
    collectSourceFileIdentifiers(entryPath, fs.readFileSync(entryPath, 'utf8'), identifiers);
  }
}

function collectSourceFileIdentifiers(sourcePath: string, sourceText: string, identifiers: Set<string>): void {
  const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      identifiers.add(node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}
