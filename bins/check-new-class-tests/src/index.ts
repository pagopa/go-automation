import * as fs from 'node:fs';
import * as path from 'node:path';
import { readChangedFiles } from './gitDiff.js';
import { findTestForClass } from './testDiscovery.js';
import {
  findExportedClassesInAddedLines,
  findExportedClassName,
  findNamedReExportsInAddedLines,
} from './typescriptAst.js';

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
  const reportedMissingTests = new Set<string>();

  for (const changedFile of readChangedFiles(baseRef)) {
    if (!fs.existsSync(changedFile.path)) continue;

    const sourceText = fs.readFileSync(changedFile.path, 'utf8');
    const classes = findExportedClassesInAddedLines(changedFile.path, sourceText, changedFile.addedLines);

    for (const classDeclaration of classes) {
      pushViolationIfMissingTest({
        violations,
        reportedMissingTests,
        sourcePath: changedFile.path,
        reportPath: changedFile.path,
        line: classDeclaration.line,
        className: classDeclaration.name,
      });
    }

    for (const reExport of findNamedReExportsInAddedLines(changedFile.path, sourceText, changedFile.addedLines)) {
      const sourcePath = resolveLocalTypeScriptModule(changedFile.path, reExport.moduleSpecifier);
      if (sourcePath === undefined) continue;

      const reExportSourceText = fs.readFileSync(sourcePath, 'utf8');
      const className = findExportedClassName(
        sourcePath,
        reExportSourceText,
        reExport.sourceName,
        reExport.exportedName,
      );
      if (className === undefined) continue;

      pushViolationIfMissingTest({
        violations,
        reportedMissingTests,
        sourcePath,
        reportPath: changedFile.path,
        line: reExport.line,
        className,
      });
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

interface MissingTestCandidate {
  readonly violations: Violation[];
  readonly reportedMissingTests: Set<string>;
  readonly sourcePath: string;
  readonly reportPath: string;
  readonly line: number;
  readonly className: string;
}

function pushViolationIfMissingTest(candidate: MissingTestCandidate): void {
  const testSubjectKey = `${candidate.sourcePath}:${candidate.className}`;
  if (candidate.reportedMissingTests.has(testSubjectKey)) return;

  const test = findTestForClass(candidate.sourcePath, candidate.className);
  if (test.found) return;

  candidate.reportedMissingTests.add(testSubjectKey);
  candidate.violations.push({
    file: candidate.reportPath,
    line: candidate.line,
    className: candidate.className,
    expectedPaths: test.expectedPaths,
  });
}

function resolveLocalTypeScriptModule(fromPath: string, moduleSpecifier: string): string | undefined {
  if (!moduleSpecifier.startsWith('.')) return undefined;

  const modulePath = path.join(path.dirname(fromPath), moduleSpecifier);
  const extension = path.extname(modulePath);
  const basePath = extension === '' ? modulePath : modulePath.slice(0, -extension.length);
  const candidates = [`${basePath}.ts`, path.join(basePath, 'index.ts')];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
