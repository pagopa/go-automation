import * as fs from 'node:fs';
import { readChangedFiles } from './gitDiff.js';
import { findTestForClass } from './testDiscovery.js';
import { findExportedClassesInAddedLines } from './typescriptAst.js';

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly className: string;
  readonly expectedPaths: ReadonlyArray<string>;
}

function readBaseRef(argv: ReadonlyArray<string>): string {
  const baseIndex = argv.indexOf('--base');
  if (baseIndex >= 0) {
    const value = argv[baseIndex + 1];
    if (value === undefined || value.trim() === '') {
      throw new Error('--base requires a non-empty git ref');
    }
    return value;
  }

  return process.env['GITHUB_BASE_REF'] !== undefined && process.env['GITHUB_BASE_REF'] !== ''
    ? `origin/${process.env['GITHUB_BASE_REF']}`
    : 'origin/main';
}

function formatViolation(violation: Violation): string {
  return [
    `- ${violation.file}:${String(violation.line)} ${violation.className}`,
    '  Expected one of:',
    ...violation.expectedPaths.map((expectedPath) => `  - ${expectedPath}`),
  ].join('\n');
}

function main(): void {
  const baseRef = readBaseRef(process.argv.slice(2));
  const violations: Violation[] = [];

  for (const changedFile of readChangedFiles(baseRef)) {
    if (!fs.existsSync(changedFile.path)) continue;

    const sourceText = fs.readFileSync(changedFile.path, 'utf8');
    const classes = findExportedClassesInAddedLines(changedFile.path, sourceText, changedFile.addedLines);

    for (const classDeclaration of classes) {
      const test = findTestForClass(changedFile.path, classDeclaration.name);
      if (!test.found) {
        violations.push({
          file: changedFile.path,
          line: classDeclaration.line,
          className: classDeclaration.name,
          expectedPaths: test.expectedPaths,
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log('No new exported package classes without tests.');
    return;
  }

  console.error('Missing unit tests for new exported package classes:\n');
  console.error(violations.map(formatViolation).join('\n\n'));
  console.error('\nAdd a focused unit test near the class or reference the class from an existing package test.');
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
