import { execFileSync } from 'node:child_process';

interface ChangedFile {
  readonly path: string;
  readonly addedLines: ReadonlySet<number>;
}

export function readChangedFiles(baseRef: string): ReadonlyArray<ChangedFile> {
  validateBaseRef(baseRef);

  const diff = execFileSync(
    'git',
    [
      'diff',
      '--unified=0',
      '--diff-filter=AMR',
      `${baseRef}...HEAD`,
      '--',
      'packages/*/src/*.ts',
      'packages/*/src/**/*.ts',
    ],
    {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  return parseGitDiff(diff).filter((file) => isProductionPackageSourceFile(file.path));
}

function validateBaseRef(baseRef: string): void {
  if (baseRef.trim() === '') {
    throw new Error('Base git ref must be non-empty');
  }

  if (baseRef.startsWith('-')) {
    throw new Error(`Base git ref must not start with "-": ${baseRef}`);
  }

  if (/\s/u.test(baseRef)) {
    throw new Error(`Base git ref must not contain whitespace: ${baseRef}`);
  }
}

export function parseGitDiff(diff: string): ReadonlyArray<ChangedFile> {
  const files = new Map<string, Set<number>>();
  let currentPath: string | undefined;
  let newLineNumber: number | undefined;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      currentPath = parseNewFilePath(line);
      newLineNumber = undefined;
      if (currentPath !== undefined) {
        files.set(currentPath, files.get(currentPath) ?? new Set<number>());
      }
      continue;
    }

    const hunkStart = parseNewHunkStart(line);
    if (hunkStart !== undefined) {
      newLineNumber = hunkStart;
      continue;
    }

    if (currentPath === undefined || newLineNumber === undefined) continue;

    if (line.startsWith('\\')) continue;

    if (line.startsWith('+')) {
      files.get(currentPath)?.add(newLineNumber);
      newLineNumber += 1;
      continue;
    }

    if (line.startsWith('-')) continue;

    newLineNumber += 1;
  }

  return [...files.entries()].map(([path, addedLines]) => ({ path, addedLines }));
}

function parseNewFilePath(line: string): string | undefined {
  const rawPath = line.slice(4).trim();
  if (rawPath === '/dev/null') return undefined;
  return rawPath.startsWith('b/') ? rawPath.slice(2) : rawPath;
}

function parseNewHunkStart(line: string): number | undefined {
  if (!line.startsWith('@@ ')) return undefined;

  const headerParts = line.split(' ');
  const newRange = headerParts.find((part) => part.startsWith('+'));
  if (newRange === undefined) return undefined;

  const startText = newRange.slice(1).split(',')[0];
  if (startText === undefined || startText === '') return undefined;

  const start = Number(startText);
  return Number.isInteger(start) && start > 0 ? start : undefined;
}

function isProductionPackageSourceFile(path: string): boolean {
  if (!/^packages\/[^/]+\/src\/.+\.ts$/u.test(path)) return false;
  if (path.endsWith('.d.ts')) return false;
  if (path.endsWith('.test.ts') || path.endsWith('.spec.ts')) return false;
  if (path.includes('/__tests__/')) return false;
  if (path.includes('/models/') || path.includes('/types/')) return false;

  return true;
}
